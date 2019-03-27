import * as cassava from "cassava";
import * as giftbitRoutes from "giftbit-cassava-routes";
import * as uuid from "uuid/v4";
import {User} from "../../../model/User";
import {dateCreatedNow, dynamodb, teamMemberDynameh, tokenActionDynameh, userDynameh} from "../../../dynamodb";
import {hashPassword} from "../../../utils/passwordUtils";
import {sendEmailAddressVerificationEmail} from "./sendEmailAddressVerificationEmail";
import {TokenAction} from "../../../model/TokenAction";
import {TeamMember} from "../../../model/TeamMember";
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

            await createUserAndAccount({
                email: evt.body.email,
                plaintextPassword: evt.body.password
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

// TODO team member registration

async function createUserAndAccount(params: { email: string, plaintextPassword: string }): Promise<void> {
    // Previously the first user in a team had the same userId as the team.
    // We no longer do that but you should be aware that is possible.
    const userId = generateUserId();
    const teamMemberId = generateUserId();
    const dateCreated = dateCreatedNow();

    const user: User = {
        email: params.email,
        userId,
        password: await hashPassword(params.plaintextPassword),
        emailVerified: false,
        frozen: false,
        defaultLoginUserId: userId,
        dateCreated
    };
    const putUserReq = userDynameh.requestBuilder.addCondition(
        userDynameh.requestBuilder.buildPutInput(user),
        {
            attribute: "email",
            operator: "attribute_not_exists"
        }
    );

    const teamMember: TeamMember = {
        userId,
        teamMemberId,
        roles: [
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
        ],
        dateCreated
    };
    const putTeamMemberReq = teamMemberDynameh.requestBuilder.addCondition(
        teamMemberDynameh.requestBuilder.buildPutInput(teamMember),
        {
            attribute: "userId",
            operator: "attribute_not_exists"
        }
    );

    const writeReq = userDynameh.requestBuilder.buildTransactWriteItemsInput(putUserReq, putTeamMemberReq);
    try {
        await dynamodb.transactWriteItems(writeReq).promise();
    } catch (error) {
        log.error("Error creating user and team", error);
        if (error.code === "ConditionalCheckFailedException") {
            throw new giftbitRoutes.GiftbitRestError(cassava.httpStatusCode.clientError.CONFLICT, "User already exists.");
        } else {
            throw error;
        }
    }

    await sendEmailAddressVerificationEmail(user);
}

async function verifyEmail(token: string): Promise<void> {
    const tokenActionReq = tokenActionDynameh.requestBuilder.buildGetInput(token);
    const tokenActionResp = await dynamodb.getItem(tokenActionReq).promise();
    const tokenAction: TokenAction = tokenActionDynameh.responseUnwrapper.unwrapGetOutput(tokenActionResp);
    if (!tokenAction || tokenAction.action !== "emailVerification") {
        log.warn("Could not find emailVerification TokenAction for token", token);
        throw new giftbitRoutes.GiftbitRestError(cassava.httpStatusCode.clientError.CONFLICT, "There was an error completing your registration.  Maybe the email verification timed out.");
    }

    const updateUserReq = userDynameh.requestBuilder.addCondition(
        userDynameh.requestBuilder.buildUpdateInputFromActions(
            {
                email: tokenAction.userEmail
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
    log.info("User", tokenAction.userEmail, "has verified their email address");
}
