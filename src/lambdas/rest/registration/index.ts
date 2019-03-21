import * as cassava from "cassava";
import * as giftbitRoutes from "giftbit-cassava-routes";
import * as uuid from "uuid/v4";
import {User} from "../../../model/User";
import {Organization} from "../../../model/Organization";
import {
    buildTransactWriteItemsInput,
    dateCreatedNow,
    dynamodb,
    emailVerificationDynameh,
    orgDynameh,
    userDynameh
} from "../../../dynamodb";
import {hashPassword} from "../../../utils/passwordUtils";
import {sendRegistrationEmail} from "./sendRegistrationEmail";
import {EmailVerification} from "../../../model/EmailVerification";
import log = require("loglevel");

export function installRegistrationRest(router: cassava.Router): void {
    router.route("/v2/user/register")
        .method("POST")
        .handler(async evt => {
            evt.validateBody({
                properties: {
                    email: {
                        type: "string",
                        format: "email"
                    },
                    password: {
                        type: "string",
                        minLength: 8
                    }
                },
                required: ["email", "password"],
                additionalProperties: false
            });

            await createUserAndOrganization({
                email: evt.body.email,
                plainTextPassword: evt.body.password,
                userId: generateUserId()
            });

            return {
                body: {},
                statusCode: cassava.httpStatusCode.success.CREATED
            };
        });

    router.route("/v2/user/register/verifyEmail")
        .method("GET")
        .handler(async evt => {
            if (!evt.queryStringParameters.token) {
                throw new giftbitRoutes.GiftbitRestError(cassava.httpStatusCode.clientError.BAD_REQUEST, "Missing 'token' query param.");
            }

            await verifyEmail(evt.queryStringParameters.token);

            return {
                body: null,
                statusCode: cassava.httpStatusCode.redirect.FOUND,
                headers: {
                    Location: `https://${process.env["LIGHTRAIL_WEBAPP_DOMAIN"]}/app/#`
                }
            };
        });
}

function generateUserId(): string {
    return "user-" + uuid().replace(/-/g, "");
}

async function getOrganization(userId: string): Promise<Organization> {
    const getReq = orgDynameh.requestBuilder.buildGetInput(userId);
    const getResp = await dynamodb.getItem(getReq).promise();
    return orgDynameh.responseUnwrapper.unwrapGetOutput(getResp);
}

// TODO team member registration

async function createUserAndOrganization(params: { email: string, plainTextPassword: string, userId: string }): Promise<void> {
    const org: Organization = {
        userId: params.userId,
        dateCreated: dateCreatedNow()
    };
    const putOrgReq = orgDynameh.requestBuilder.addCondition(
        orgDynameh.requestBuilder.buildPutInput(org),
        {
            attribute: "userId",
            operator: "attribute_not_exists"
        }
    );

    const badge = new giftbitRoutes.jwtauth.AuthorizationBadge();
    badge.userId = params.userId;
    badge.teamMemberId = params.userId;
    badge.roles = [
        "accountManager",
        "contactManager",
        "customerServiceRepresentative",
        "customerServiceManager",
        "pointOfSale",
        "programManager",
        "promoter",
        "reporter",
        "securityManager",
        "teamAdmin",
        "webPortal"
    ];

    const user: User = {
        email: params.email,
        password: await hashPassword(params.plainTextPassword),
        emailVerified: false,
        frozen: false,
        defaultLoginOrganizationId: params.userId,
        organizations: {
            [params.userId]: {
                userId: params.userId,
                teamMemberId: params.userId,
                jwtPayload: badge.getJwtPayload(),
                dateCreated: dateCreatedNow()
            }
        },
        dateCreated: dateCreatedNow()
    };
    const putUserReq = userDynameh.requestBuilder.addCondition(
        userDynameh.requestBuilder.buildPutInput(user),
        {
            attribute: "email",
            operator: "attribute_not_exists"
        }
    );

    const emailValidationTimeoutDate = new Date();
    emailValidationTimeoutDate.setDate(emailValidationTimeoutDate.getDate() + 1);
    const emailVerification: EmailVerification = {
        token: uuid().replace(/-/g, ""),
        userEmail: user.email,
        ttl: emailValidationTimeoutDate
    };
    const putEmailValidationReq = emailVerificationDynameh.requestBuilder.buildPutInput(emailVerification);

    const writeReq = buildTransactWriteItemsInput(putOrgReq, putUserReq, putEmailValidationReq);

    try {
        await dynamodb.transactWriteItems(writeReq).promise();
    } catch (error) {
        log.error("Error creating user and organization", error);
        if (error.code === "ConditionalCheckFailedException") {
            throw new giftbitRoutes.GiftbitRestError(cassava.httpStatusCode.clientError.CONFLICT, "Organization or user already exists.");
        } else {
            throw error;
        }
    }

    await sendRegistrationEmail(emailVerification);
}

export async function sendNewEmailVerification(user: User): Promise<void> {
    const emailValidationTimeoutDate = new Date();
    emailValidationTimeoutDate.setDate(emailValidationTimeoutDate.getDate() + 1);
    const emailVerification: EmailVerification = {
        token: uuid().replace(/-/g, ""),
        userEmail: user.email,
        ttl: emailValidationTimeoutDate
    };
    const putEmailValidationReq = emailVerificationDynameh.requestBuilder.buildPutInput(emailVerification);
    await dynamodb.putItem(putEmailValidationReq).promise();
    await sendRegistrationEmail(emailVerification);
}

async function verifyEmail(token: string): Promise<void> {
    const emailVerificationGetReq = emailVerificationDynameh.requestBuilder.buildGetInput(token);
    const emailVerificationResp = await dynamodb.getItem(emailVerificationGetReq).promise();
    const emailVerification: EmailVerification = emailVerificationDynameh.responseUnwrapper.unwrapGetOutput(emailVerificationResp);
    if (!emailVerification) {
        log.warn("Could not find EmailVerification for token", token);
        throw new giftbitRoutes.GiftbitRestError(cassava.httpStatusCode.clientError.CONFLICT, "There was an error completing your registration.  Maybe the email verification timed out.");
    }

    const updateUserReq = userDynameh.requestBuilder.addCondition(
        userDynameh.requestBuilder.buildUpdateInputFromActions(
            {
                email: emailVerification.userEmail
            },
            {
                action: "put",
                attribute: "emailVerified",
                value: true
            }
        ),
        {
            attribute: "email",
            operator: "attribute_exists"
        }
    );

    await dynamodb.updateItem(updateUserReq).promise();
    log.info("User", emailVerification.userEmail, "has verified their email address");
}
