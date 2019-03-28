import * as aws from "aws-sdk";
import * as cassava from "cassava";
import * as giftbitRoutes from "giftbit-cassava-routes";
import {User} from "../../../model/User";
import {dateCreatedNow, dynamodb, teamMemberDynameh, tokenActionDynameh, userDynameh} from "../../../dynamodb";
import {hashPassword} from "../../../utils/passwordUtils";
import {sendEmailAddressVerificationEmail} from "./sendEmailAddressVerificationEmail";
import {TokenAction} from "../../../model/TokenAction";
import {TeamMember} from "../../../model/TeamMember";
import {generateUserId, getTeamMember, getUserById} from "../../../utils/userUtils";
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

    router.route("/v2/user/register/acceptInvite")
        .method("GET")
        .handler(async evt => {
            if (!evt.queryStringParameters.token) {
                throw new giftbitRoutes.GiftbitRestError(cassava.httpStatusCode.clientError.BAD_REQUEST, "Missing 'token' query param.");
            }

            const location = await acceptInvite(evt.queryStringParameters.token);

            return {
                body: null,
                statusCode: cassava.httpStatusCode.redirect.FOUND,
                headers: {
                    Location: location
                }
            };
        });
}

async function createUserAndAccount(params: { email: string, plaintextPassword: string }): Promise<void> {
    // Previously the first user in a team had the same userId as the team.
    // We no longer do that but you should be aware that is possible.
    const userId = generateUserId();
    const teamMemberId = generateUserId();
    const dateCreated = dateCreatedNow();

    const user: User = {
        email: params.email,
        userId: teamMemberId,
        password: await hashPassword(params.plaintextPassword),
        emailVerified: false,
        frozen: false,
        defaultLoginUserId: userId,
        dateCreated
    };
    const putUserReq = userDynameh.requestBuilder.buildConditionalPutInput(
        user,
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
    const putTeamMemberReq = teamMemberDynameh.requestBuilder.buildConditionalPutInput(
        teamMember,
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
        throw new giftbitRoutes.GiftbitRestError(cassava.httpStatusCode.clientError.CONFLICT, "There was an error completing your registration.  Maybe the email verification expired.");
    }

    const updateUserReq = userDynameh.requestBuilder.addCondition(
        userDynameh.requestBuilder.buildUpdateInputFromActions(
            {
                email: tokenAction.email
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
    log.info("User", tokenAction.email, "has verified their email address");
}

async function acceptInvite(token: string): Promise<string> {
    const acceptInviteTokenActionReq = tokenActionDynameh.requestBuilder.buildGetInput(token);
    const acceptInviteTokenActionResp = await dynamodb.getItem(acceptInviteTokenActionReq).promise();
    const acceptInviteTokenAction: TokenAction = tokenActionDynameh.responseUnwrapper.unwrapGetOutput(acceptInviteTokenActionResp);
    if (!acceptInviteTokenAction || acceptInviteTokenAction.action !== "acceptTeamInvite") {
        log.warn("Cannot accept team invite: can't find acceptTeamInvite TokenAction for token", token);
        throw new giftbitRoutes.GiftbitRestError(cassava.httpStatusCode.clientError.CONFLICT, "There was an error completing your registration.  Maybe the invite expired.");
    }

    const updates: (aws.DynamoDB.PutItemInput | aws.DynamoDB.DeleteItemInput | aws.DynamoDB.UpdateItemInput)[] = [
        tokenActionDynameh.requestBuilder.buildDeleteInput(acceptInviteTokenAction)
    ];

    const user = await getUserById(acceptInviteTokenAction.teamMemberId);
    if (!user) {
        throw new Error(`Cannot accept team invite: can't find User with id ${acceptInviteTokenAction.teamMemberId}`);
    }
    if (!user.emailVerified) {
        // Accepting the invite verifies the email address.
        updates.push(userDynameh.requestBuilder.addCondition(
            userDynameh.requestBuilder.buildUpdateInputFromActions(
                {
                    email: acceptInviteTokenAction.email
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
        ));
    }

    const teamMember = await getTeamMember(acceptInviteTokenAction.userId, acceptInviteTokenAction.teamMemberId);
    if (!teamMember) {
        log.warn("Cannot accept team invite: can't find TeamMember with ids", acceptInviteTokenAction.userId, acceptInviteTokenAction.teamMemberId);
        throw new giftbitRoutes.GiftbitRestError(cassava.httpStatusCode.clientError.CONFLICT, "There was an error completing your registration.  Maybe the invite expired.");
    }
    if (teamMember.invitation) {
        updates.push(teamMemberDynameh.requestBuilder.addCondition(
            teamMemberDynameh.requestBuilder.buildUpdateInputFromActions(
                {
                    userId: acceptInviteTokenAction.userId,
                    teamMemberId: acceptInviteTokenAction.teamMemberId
                },
                {
                    action: "remove",
                    attribute: "invitation"
                }
            ),
            {
                attribute: "userId",
                operator: "attribute_exists"
            }
        ));
    }

    const writeReq = userDynameh.requestBuilder.buildTransactWriteItemsInput(...updates);
    await dynamodb.transactWriteItems(writeReq).promise();
    log.info("User", acceptInviteTokenAction.email, "has accepted a team invite");

    if (!user.password) {
        log.info("User", acceptInviteTokenAction.email, "has no password, setting up password reset");
        const setPasswordTokenAction = TokenAction.generate("resetPassword", 1, {email: acceptInviteTokenAction.email});
        const setPasswordTokenActionReq = tokenActionDynameh.requestBuilder.buildPutInput(setPasswordTokenAction);
        await dynamodb.putItem(setPasswordTokenActionReq).promise();
        return `https://${process.env["LIGHTRAIL_WEBAPP_DOMAIN"]}/app/#/resetPassword?token=${encodeURIComponent(setPasswordTokenAction.token)}`
    }

    return `https://${process.env["LIGHTRAIL_WEBAPP_DOMAIN"]}/app/#`;
}
