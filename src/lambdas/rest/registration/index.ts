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
import {sendRegistrationVerificationEmail} from "./sendRegistrationVerificationEmail";
import {DbAccountUser} from "../../../db/DbAccountUser";
import {TokenAction} from "../../../db/TokenAction";
import {DbUserUniqueness} from "../../../db/DbUserUniqueness";
import {DbUser} from "../../../db/DbUser";
import {DbAccount} from "../../../db/DbAccount";
import {sendRegistrationRecoveryEmail} from "./sendRegistrationRecoveryEmail";
import {getRolesForUserPrivilege} from "../../../utils/rolesUtils";
import {getLoginResponse} from "../login";
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
                        minLength: 8,
                        maxLength: 255
                    },
                    name: {
                        type: "string",
                        minLength: 1,
                        maxLength: 1023
                    }
                },
                required: ["email", "password"],
                additionalProperties: false
            });

            await registerNewUser({
                email: evt.body.email,
                plaintextPassword: evt.body.password,
                name: evt.body.name
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

    router.route("/v2/user/register/acceptInvitation")
        .method("GET")
        .handler(async evt => {
            if (!evt.queryStringParameters.token) {
                throw new giftbitRoutes.GiftbitRestError(cassava.httpStatusCode.clientError.BAD_REQUEST, "Missing 'token' query param.");
            }

            return await acceptInvitation(evt.queryStringParameters.token);
        });
}

async function registerNewUser(params: { email: string, plaintextPassword: string, name?: string }): Promise<void> {
    // Previously the first user in a team had the same userId as the team.
    // We no longer do that but you should be aware that is possible.
    const accountId = DbAccount.generateAccountId();
    const userId = DbUser.generateUserId();
    const createdDate = createdDateNow();

    log.info("Registering new account and user, email=", params.email, "accountId=", accountId, "userId=", userId);

    const user: DbUser = {
        email: params.email,
        userId: userId,
        login: {
            password: await hashPassword(params.plaintextPassword),
            emailVerified: false,
            frozen: false,
            defaultLoginAccountId: accountId
        },
        createdDate
    };
    const putUserReq = DbUser.buildPutInput(user);

    const userUniqueness: DbUserUniqueness = {
        userId: userId
    };
    const putUserUniquenessReq = DbUserUniqueness.buildPutInput(userUniqueness);

    const account: DbAccount = {
        accountId: accountId,
        name: params.name ?? "Account"
    };
    const putAccountReq = DbAccount.buildPutInput(account);

    const accountUser: DbAccountUser = {
        accountId: accountId,
        userId: userId,
        userDisplayName: params.email,
        accountDisplayName: account.name,
        roles: getRolesForUserPrivilege("OWNER"),
        scopes: [],
        createdDate
    };
    const putAccountUserReq = DbAccountUser.buildPutInput(accountUser);

    const writeReq = objectDynameh.requestBuilder.buildTransactWriteItemsInput(putUserReq, putUserUniquenessReq, putAccountReq, putAccountUserReq);
    try {
        await transactWriteItemsFixed(writeReq);
    } catch (error) {
        if (error.code === "TransactionCanceledException"
            && error.CancellationReasons
            && error.CancellationReasons.length > 0
            && error.CancellationReasons[0].Code === "ConditionalCheckFailed"
        ) {
            // The registration failed because a user with that email address already exists.
            const existingUser = await DbUser.get(params.email);
            if (!existingUser.login.emailVerified && !existingUser.login.password) {
                // This can happen if the user was previously invited to an account but hasn't accepted.
                // That invitation may or may not still be valid.
                log.info("User", params.email, "exists with unverified email and no password");
                return await registerExistingUser(existingUser, accountId, params);
            } else {
                // Silently claim success but send an email notifying of the attempted registration.
                // We do this to not leak information on what email addresses are in use to a potential attacker;
                // while reminding innocent users of their existing account.
                log.info("User", params.email, "exists and has already verified their email");
                await sendRegistrationRecoveryEmail(params.email);
            }
            return;
        }
        throw error;
    }

    await sendRegistrationVerificationEmail(params.email);
}

async function registerExistingUser(user: DbUser, accountId: string, params: { email: string, plaintextPassword: string, name?: string }): Promise<void> {
    if (user.login.password || user.login.emailVerified) {
        throw new Error("This flow is only suitable for Users that happen to exist but have never registered before.");
    }

    const createdDate = createdDateNow();

    log.info("Registering new account for existing user, email=", params.email, "accountId=", accountId, "userId=", user.userId);

    const updateUserReq = DbUser.buildUpdateInput(user, {
        action: "put",
        attribute: "login.password",
        value: await hashPassword(params.plaintextPassword)
    }, {
        action: "put",
        attribute: "login.defaultLoginAccountId",
        value: accountId
    });
    objectDynameh.requestBuilder.addCondition(updateUserReq, {
        attribute: "login.password",
        operator: "attribute_not_exists"
    }, {
        attribute: "login.emailVerified",
        operator: "=",
        values: [false]
    });

    const account: DbAccount = {
        accountId: accountId,
        name: params.name ?? "Account"
    };
    const putAccountReq = DbAccount.buildPutInput(account);

    const accountUser: DbAccountUser = {
        accountId: accountId,
        userId: user.userId,
        userDisplayName: params.email,
        accountDisplayName: account.name,
        roles: getRolesForUserPrivilege("OWNER"),
        scopes: [],
        createdDate
    };
    const putAccountUserReq = DbAccountUser.buildPutInput(accountUser);

    const writeReq = objectDynameh.requestBuilder.buildTransactWriteItemsInput(updateUserReq, putAccountReq, putAccountUserReq);
    await transactWriteItemsFixed(writeReq);

    await sendRegistrationVerificationEmail(params.email);
}

async function verifyEmail(token: string): Promise<void> {
    const tokenAction = await TokenAction.get(token);
    if (!tokenAction || tokenAction.action !== "emailVerification") {
        log.warn("Could not find emailVerification TokenAction for token", token);
        throw new giftbitRoutes.GiftbitRestError(cassava.httpStatusCode.clientError.NOT_FOUND, "There was an error completing your registration.  Maybe the email verification expired.");
    }

    const user = await DbUser.get(tokenAction.email);
    if (!user) {
        throw new Error(`Could not find DbUser for TokenAction with email '${tokenAction.email}'.`);
    }

    await DbUser.update(user, {
        action: "put",
        attribute: "login.emailVerified",
        value: true
    });

    await TokenAction.del(tokenAction);
    log.info("User", tokenAction.email, "has verified their email address");
}

async function acceptInvitation(token: string): Promise<cassava.RouterResponse> {
    const acceptInvitationTokenAction = await TokenAction.get(token);
    if (!acceptInvitationTokenAction || acceptInvitationTokenAction.action !== "acceptAccountInvitation") {
        log.warn("Cannot accept account invitation: can't find acceptInvitation TokenAction for token", token);
        throw new giftbitRoutes.GiftbitRestError(cassava.httpStatusCode.clientError.NOT_FOUND, "There was an error completing your registration.  Maybe the invitation expired.");
    }

    const updates: (aws.DynamoDB.PutItemInput | aws.DynamoDB.DeleteItemInput | aws.DynamoDB.UpdateItemInput)[] = [
        tokenActionDynameh.requestBuilder.buildDeleteInput(acceptInvitationTokenAction)
    ];

    const user = await DbUser.getById(acceptInvitationTokenAction.userId);
    if (!user) {
        throw new Error(`Cannot accept account invitation: can't find User with id ${acceptInvitationTokenAction.userId}`);
    }
    if (!user.login.emailVerified) {
        // Accepting the invite verifies the email address.
        const updateUserReq = objectDynameh.requestBuilder.buildUpdateInputFromActions(
            DbUser.getKeys(user),
            {
                action: "put",
                attribute: "login.emailVerified",
                value: true
            }
        );
        objectDynameh.requestBuilder.addCondition(updateUserReq, {
            attribute: "pk",
            operator: "attribute_exists"
        });
        updates.push(updateUserReq);
    }

    const accountUser = await DbAccountUser.get(acceptInvitationTokenAction.accountId, acceptInvitationTokenAction.userId);
    if (!accountUser) {
        log.warn("Cannot accept account invitation: can't find DbAccountUser with accountId=", acceptInvitationTokenAction.accountId, "userId=", acceptInvitationTokenAction.userId);
        throw new giftbitRoutes.GiftbitRestError(cassava.httpStatusCode.clientError.NOT_FOUND, "There was an error completing your registration.  Maybe the invitation expired.");
    }
    if (accountUser.pendingInvitation) {
        const updateAccountUserReq = DbAccountUser.buildUpdateInput(accountUser, {
            action: "remove",
            attribute: "pendingInvitation"
        });
        objectDynameh.requestBuilder.addCondition(updateAccountUserReq, {
                attribute: "userId",
                operator: "attribute_exists"
            }
        );
        updates.push(updateAccountUserReq);
    }

    const writeReq = objectDynameh.requestBuilder.buildTransactWriteItemsInput(...updates);
    await dynamodb.transactWriteItems(writeReq).promise();
    log.info("User", acceptInvitationTokenAction.email, "has accepted an account invitation");

    if (!user.login.password) {
        log.info("User", acceptInvitationTokenAction.email, "has no password, setting up password reset");
        const setPasswordTokenAction = TokenAction.generate("resetPassword", 24, {email: acceptInvitationTokenAction.email});
        await TokenAction.put(setPasswordTokenAction);
        return {
            body: null,
            statusCode: cassava.httpStatusCode.redirect.FOUND,
            headers: {
                Location: `https://${process.env["LIGHTRAIL_WEBAPP_DOMAIN"]}/app/#/resetPassword?token=${encodeURIComponent(setPasswordTokenAction.token)}`
            }
        };
    }

    return getLoginResponse(user, accountUser, true);
}
