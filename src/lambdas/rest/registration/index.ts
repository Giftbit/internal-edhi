import * as aws from "aws-sdk";
import * as cassava from "cassava";
import * as giftbitRoutes from "giftbit-cassava-routes";
import {
    createdDateNow,
    dynamodb,
    objectDynameh,
    tokenActionDynameh,
    transactWriteItemsFixed
} from "../../../db/dynamodb";
import {hashPassword} from "../../../utils/passwordUtils";
import {sendEmailAddressVerificationEmail} from "./sendEmailAddressVerificationEmail";
import {DbAccountUser} from "../../../db/DbAccountUser";
import {TokenAction} from "../../../db/TokenAction";
import {DbUser} from "../../../db/DbUser";
import {DbUserLogin} from "../../../db/DbUserLogin";
import {DbAccount} from "../../../db/DbAccount";
import {sendEmailAddressAlreadyRegisteredEmail} from "./sendEmailAddressAlreadyRegisteredEmail";
import {getRolesForUserPrivilege} from "../../../utils/rolesUtils";
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

            const acceptRes = await acceptInvite(evt.queryStringParameters.token);

            return {
                body: null,
                statusCode: cassava.httpStatusCode.redirect.FOUND,
                headers: {
                    Location: acceptRes.redirectUrl
                }
            };
        });
}

async function createUserAndAccount(params: { email: string, plaintextPassword: string }): Promise<void> {
    // Previously the first user in a team had the same userId as the team.
    // We no longer do that but you should be aware that is possible.
    const userId = DbUser.generateUserId();
    const teamMemberId = DbUser.generateUserId();
    const createdDate = createdDateNow();

    log.info("Registering new user email=", params.email, "userId=", userId, "teamMemberId=", teamMemberId);

    const userLogin: DbUserLogin = {
        email: params.email,
        userId: teamMemberId,
        password: await hashPassword(params.plaintextPassword),
        emailVerified: false,
        frozen: false,
        defaultLoginUserId: userId,
        createdDate
    };
    const putUserLoginReq = objectDynameh.requestBuilder.buildPutInput(DbUserLogin.toDbObject(userLogin));
    objectDynameh.requestBuilder.addCondition(putUserLoginReq, {
        attribute: "pk",
        operator: "attribute_not_exists"
    });

    const userDetails: DbUser = {
        userId: teamMemberId,
        email: params.email
    };
    const putUserDetailsReq = objectDynameh.requestBuilder.buildPutInput(DbUser.toDbObject(userDetails));
    objectDynameh.requestBuilder.addCondition(putUserDetailsReq, {
        attribute: "pk",
        operator: "attribute_not_exists"
    });

    const accountDetails: DbAccount = {
        userId,
        name: "My Organization"
    };
    const putAccountDetailsReq = objectDynameh.requestBuilder.buildPutInput(DbAccount.toDbObject(accountDetails));
    objectDynameh.requestBuilder.addCondition(putAccountDetailsReq, {
        attribute: "pk",
        operator: "attribute_not_exists"
    });

    const teamMember: DbAccountUser = {
        userId,
        teamMemberId,
        userDisplayName: params.email,
        accountDisplayName: accountDetails.name,
        roles: getRolesForUserPrivilege("OWNER"),
        scopes: [],
        createdDate
    };
    const putTeamMemberReq = objectDynameh.requestBuilder.buildPutInput(DbAccountUser.toDbObject(teamMember));
    objectDynameh.requestBuilder.addCondition(putTeamMemberReq, {
        attribute: "pk",
        operator: "attribute_not_exists"
    });

    const writeReq = objectDynameh.requestBuilder.buildTransactWriteItemsInput(putUserLoginReq, putUserDetailsReq, putAccountDetailsReq, putTeamMemberReq);
    try {
        await transactWriteItemsFixed(writeReq);
    } catch (error) {
        if (error.code === "TransactionCanceledException"
            && error.CancellationReasons
            && error.CancellationReasons.length === 4
            && error.CancellationReasons[0].Code === "ConditionalCheckFailed"
        ) {
            // The registration failed because a user with that email address already exists.
            // Silently claim success but send an email notifying of the attempted registration.
            // We do this to not leak information on what email addresses are in use to a potential attacker;
            // while reminding innocent users of their existing account.
            await sendEmailAddressAlreadyRegisteredEmail(params.email);
            return;
        }
        throw error;
    }

    await sendEmailAddressVerificationEmail(params.email);
}

async function verifyEmail(token: string): Promise<void> {
    const tokenAction = await TokenAction.get(token);
    if (!tokenAction || tokenAction.action !== "emailVerification") {
        log.warn("Could not find emailVerification TokenAction for token", token);
        throw new giftbitRoutes.GiftbitRestError(cassava.httpStatusCode.clientError.NOT_FOUND, "There was an error completing your registration.  Maybe the email verification expired.");
    }

    const userLogin = await DbUserLogin.get(tokenAction.email);
    if (!userLogin) {
        throw new Error(`Could not find DbUserLogin for TokenAction with email '${tokenAction.email}'.`);
    }

    await DbUserLogin.update(userLogin, {
        action: "put",
        attribute: "emailVerified",
        value: true
    });

    await TokenAction.del(tokenAction);
    log.info("User", tokenAction.email, "has verified their email address");
}

async function acceptInvite(token: string): Promise<{ redirectUrl: string }> {
    const acceptInviteTokenAction = await TokenAction.get(token);
    if (!acceptInviteTokenAction || acceptInviteTokenAction.action !== "acceptTeamInvite") {
        log.warn("Cannot accept team invite: can't find acceptTeamInvite TokenAction for token", token);
        throw new giftbitRoutes.GiftbitRestError(cassava.httpStatusCode.clientError.NOT_FOUND, "There was an error completing your registration.  Maybe the invite expired.");
    }

    const updates: (aws.DynamoDB.PutItemInput | aws.DynamoDB.DeleteItemInput | aws.DynamoDB.UpdateItemInput)[] = [
        tokenActionDynameh.requestBuilder.buildDeleteInput(acceptInviteTokenAction)
    ];

    const userLogin = await DbUserLogin.getById(acceptInviteTokenAction.teamMemberId);
    if (!userLogin) {
        throw new Error(`Cannot accept team invite: can't find UserLogin with id ${acceptInviteTokenAction.teamMemberId}`);
    }
    if (!userLogin.emailVerified) {
        // Accepting the invite verifies the email address.
        const updateUserReq = objectDynameh.requestBuilder.buildUpdateInputFromActions(
            DbUserLogin.getKeys(userLogin),
            {
                action: "put",
                attribute: "emailVerified",
                value: true
            }
        );
        objectDynameh.requestBuilder.addCondition(updateUserReq, {
            attribute: "pk",
            operator: "attribute_exists"
        });
        updates.push(updateUserReq);
    }

    const teamMember = await DbAccountUser.get(acceptInviteTokenAction.userId, acceptInviteTokenAction.teamMemberId);
    if (!teamMember) {
        log.warn("Cannot accept team invite: can't find TeamMember with ids", acceptInviteTokenAction.userId, acceptInviteTokenAction.teamMemberId);
        throw new giftbitRoutes.GiftbitRestError(cassava.httpStatusCode.clientError.NOT_FOUND, "There was an error completing your registration.  Maybe the invite expired.");
    }
    if (teamMember.invitation) {
        const updateTeamMemberReq = objectDynameh.requestBuilder.buildUpdateInputFromActions(
            DbAccountUser.getKeys(teamMember),
            {
                action: "remove",
                attribute: "invitation"
            }
        );
        objectDynameh.requestBuilder.addCondition(updateTeamMemberReq, {
                attribute: "userId",
                operator: "attribute_exists"
            }
        );
        updates.push(updateTeamMemberReq);
    }

    const writeReq = objectDynameh.requestBuilder.buildTransactWriteItemsInput(...updates);
    await dynamodb.transactWriteItems(writeReq).promise();
    log.info("User", acceptInviteTokenAction.email, "has accepted a team invite");

    if (!userLogin.password) {
        log.info("User", acceptInviteTokenAction.email, "has no password, setting up password reset");
        const setPasswordTokenAction = TokenAction.generate("resetPassword", 24, {email: acceptInviteTokenAction.email});
        await TokenAction.put(setPasswordTokenAction);
        return {
            redirectUrl: `https://${process.env["LIGHTRAIL_WEBAPP_DOMAIN"]}/app/#/resetPassword?token=${encodeURIComponent(setPasswordTokenAction.token)}`
        };
    }

    return {
        redirectUrl: `https://${process.env["LIGHTRAIL_WEBAPP_DOMAIN"]}/app/#`
    };
}
