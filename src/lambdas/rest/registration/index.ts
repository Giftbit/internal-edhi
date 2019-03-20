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
import log = require("loglevel");
import {hashPassword} from "./passwordUtils";
import {sendRegistrationEmail} from "./sendRegistrationEmail";
import {EmailVerification} from "../../../model/EmailVerification";

export function installRegistrationRest(router: cassava.Router): void {

    router.route("/v2/user/register")
        .method("POST")
        .handler(async evt => {
            evt.validateBody({
                properties: {
                    username: {
                        type: "string"
                    },
                    password: {
                        type: "string",
                        minLength: 8
                    }
                },
                required: ["username", "password"],
                additionalProperties: false
            });

            await createUserAndOrganization({
                username: evt.body.username,
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

async function createUserAndOrganization(options: {username: string, plainTextPassword: string, userId: string}): Promise<void> {
    const org: Organization = {
        userId: options.userId,
        dateCreated: dateCreatedNow()
    };
    const putOrgReq = orgDynameh.requestBuilder.addCondition(
        orgDynameh.requestBuilder.buildPutInput(org),
        {
            attribute: "userId",
            operator: "attribute_not_exists"
        }
    );

    const user: User = {
        email: options.username,
        password: await hashPassword(options.plainTextPassword),
        emailVerified: false,
        frozen: false,
        organizations: {
            [options.userId]: {
                userId: options.userId,
                teamMemberId: options.userId,
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
    emailValidationTimeoutDate.setDate(emailValidationTimeoutDate.getDate() + 7);
    const emailValidation: EmailVerification = {
        token: uuid().replace(/-/g, ""),
        userEmail: user.email,
        ttl: emailValidationTimeoutDate
    };
    const putEmailValidationReq = emailVerificationDynameh.requestBuilder.buildPutInput(emailValidation);

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

    await sendRegistrationEmail(emailValidation);
}

async function verifyEmail(token: string): Promise<void> {
    const emailVerificationGetReq = emailVerificationDynameh.requestBuilder.buildGetInput(token);
    const emailVerificationResp = await dynamodb.getItem(emailVerificationGetReq).promise();
    const emailVerification: EmailVerification = emailVerificationDynameh.responseUnwrapper.unwrapGetOutput(emailVerificationResp);
    if (!emailVerification) {
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

    await dynamodb.updateItem(updateUserReq);
}
