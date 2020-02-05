import * as cassava from "cassava";
import * as dynameh from "dynameh";
import * as giftbitRoutes from "giftbit-cassava-routes";
import {DbAccountUser} from "../../../db/DbAccountUser";
import {createdDateNow, dynamodb, objectDynameh} from "../../../db/dynamodb";
import {isTestModeUserId, stripUserIdTestMode} from "../../../utils/userUtils";
import {DbUserLogin} from "../../../db/DbUserLogin";
import {DbUser} from "../../../db/DbUser";
import {deleteApiKeysForUser} from "../apiKeys";
import {UserAccount} from "../../../model/UserAccount";
import {AccountUser} from "../../../model/AccountUser";
import {DbAccount} from "../../../db/DbAccount";
import {Account} from "../../../model/Account";
import {getRolesForUserPrivilege} from "../../../utils/rolesUtils";
import log = require("loglevel");

export function installAccountRest(router: cassava.Router): void {
    router.route("/v2/account")
        .method("GET")
        .handler(async evt => {
            const auth: giftbitRoutes.jwtauth.AuthorizationBadge = evt.meta["auth"];
            auth.requireScopes("lightrailV2:account:read");
            auth.requireIds("userId");
            const account = await DbAccount.get(auth.userId);
            return {
                body: Account.getFromDbAccount(account)
            };
        });

    router.route("/v2/account")
        .method("PATCH")
        .handler(async evt => {
            const auth: giftbitRoutes.jwtauth.AuthorizationBadge = evt.meta["auth"];
            auth.requireScopes("lightrailV2:account:update");

            evt.validateBody({
                properties: {
                    name: {
                        type: "string",
                        minLength: 1,
                        maxLength: 1023
                    }
                },
                required: [],
                additionalProperties: false
            });

            const account = await updateAccount(auth, evt.body);
            return {
                body: Account.getFromDbAccount(account)
            };
        });

    router.route("/v2/account")
        .method("POST")
        .handler(async evt => {
            const auth: giftbitRoutes.jwtauth.AuthorizationBadge = evt.meta["auth"];
            auth.requireScopes("lightrailV2:account:create");

            evt.validateBody({
                properties: {
                    name: {
                        type: "string",
                        minLength: 1,
                        maxLength: 1024
                    }
                },
                required: ["name"],
                additionalProperties: false
            });

            const account = await createAccount(auth, evt.body);

            return {
                body: Account.getFromDbAccount(account),
                statusCode: cassava.httpStatusCode.success.CREATED
            };
        });

    router.route("/v2/account/switch")
        .method("GET")
        .handler(async evt => {
            const auth: giftbitRoutes.jwtauth.AuthorizationBadge = evt.meta["auth"];
            auth.requireScopes("lightrailV2:user:read");
            auth.requireIds("teamMemberId");
            const userAccounts = await DbAccountUser.getAllForUser(auth.teamMemberId);
            return {
                body: userAccounts.map(UserAccount.fromDbAccountUser)
            };
        });

    router.route("/v2/account/switch")
        .method("POST")
        .handler(async evt => {
            const auth: giftbitRoutes.jwtauth.AuthorizationBadge = evt.meta["auth"];
            auth.requireScopes("lightrailV2:user:read");
            auth.requireIds("userId", "teamMemberId");

            evt.validateBody({
                properties: {
                    mode: {
                        type: "string",
                        enum: ["live", "test"]
                    },
                    accountId: {
                        type: "string",
                        minLength: 1
                    }
                },
                required: [],
                additionalProperties: false
            });

            const userLogin = await DbUserLogin.getByAuth(auth);
            const accountUser = await DbAccountUser.getByUserLogin(userLogin, evt.body.accountId);
            let liveMode = evt.body.mode === "live" || (!evt.body.mode && evt.body.accountId && isTestModeUserId(evt.body.accountId));
            const userBadge = DbUserLogin.getBadge(accountUser, liveMode, true);

            return {
                body: null,
                statusCode: cassava.httpStatusCode.redirect.FOUND,
                headers: {
                    Location: `https://${process.env["LIGHTRAIL_WEBAPP_DOMAIN"]}/app/#`
                },
                cookies: await DbUserLogin.getBadgeCookies(userBadge)
            };
        });

    router.route("/v2/account/users")
        .method("GET")
        .handler(async evt => {
            const auth: giftbitRoutes.jwtauth.AuthorizationBadge = evt.meta["auth"];
            auth.requireScopes("lightrailV2:account:users:list");
            auth.requireIds("userId");
            const teamMembers = await DbAccountUser.getAllForAccount(auth.userId);
            return {
                body: teamMembers.map(AccountUser.fromDbAccountUser)
            };
        });

    router.route("/v2/account/users/{id}")
        .method("GET")
        .handler(async evt => {
            const auth: giftbitRoutes.jwtauth.AuthorizationBadge = evt.meta["auth"];
            auth.requireScopes("lightrailV2:account:users:read");
            auth.requireIds("userId");
            const teamMember = await DbAccountUser.get(auth.userId, evt.pathParameters.id);
            if (!teamMember || teamMember.invitation) {
                throw new giftbitRoutes.GiftbitRestError(cassava.httpStatusCode.clientError.NOT_FOUND, `Could not find user with id '${evt.pathParameters.id}'.`, "UserNotFound");
            }
            return {
                body: AccountUser.fromDbAccountUser(teamMember)
            };
        });

    router.route("/v2/account/users/{id}")
        .method("PATCH")
        .handler(async evt => {
            const auth: giftbitRoutes.jwtauth.AuthorizationBadge = evt.meta["auth"];
            auth.requireScopes("lightrailV2:account:users:update");

            evt.validateBody({
                properties: {
                    roles: {
                        type: "array",
                        items: {
                            type: "string",
                            minLength: 1
                        }
                    },
                    scopes: {
                        type: "array",
                        items: {
                            type: "string",
                            minLength: 1
                        }
                    },
                },
                required: [],
                additionalProperties: false
            });

            const teamMember = await updateAccountUser(auth, evt.pathParameters.id, evt.body);
            return {
                body: AccountUser.fromDbAccountUser(teamMember)
            };
        });

    router.route("/v2/account/users/{id}")
        .method("DELETE")
        .handler(async evt => {
            const auth: giftbitRoutes.jwtauth.AuthorizationBadge = evt.meta["auth"];
            auth.requireScopes("lightrailV2:account:users:delete");
            await removeAccountUser(auth, evt.pathParameters.id);
            return {
                body: {}
            };
        });
}

async function updateAccount(auth: giftbitRoutes.jwtauth.AuthorizationBadge, params: { name?: string }): Promise<DbAccount> {
    auth.requireIds("userId");
    log.info("Updating Account", auth.userId);

    const account = await DbAccount.get(auth.userId);
    if (!account) {
        throw new Error(`Could not find DbAccount for user '${auth.userId}'`);
    }

    const updates: dynameh.UpdateExpressionAction[] = [];
    if (params.name) {
        updates.push({
            action: "put",
            attribute: "name",
            value: params.name
        });
        account.name = params.name;
    }

    if (!updates.length) {
        return account;
    }

    await DbAccount.update(account, ...updates);

    // Update non-authoritative data.
    if (params.name) {
        log.info("Updating TeamMember.accountDisplayName for Account", auth.userId);

        const accountUsers = await DbAccountUser.getAllForAccount(auth.userId);
        for (const accountUser of accountUsers) {
            try {
                await DbAccountUser.update(accountUser, {
                    attribute: "accountDisplayName",
                    action: "put",
                    value: params.name
                });
            } catch (error) {
                log.error("Unable to change accountDisplayName for AccountUser", accountUser.accountId, accountUser.userId, "\n", error);
            }
        }
    }

    return account;
}

async function createAccount(auth: giftbitRoutes.jwtauth.AuthorizationBadge, params: { name: string }): Promise<DbAccount> {
    auth.requireIds("teamMemberId");
    const accountId = DbAccount.generateAccountId();
    log.info("Creating new Account", accountId, "for existing user", auth.teamMemberId);

    const userDetails = await DbUser.getByAuth(auth);
    if (!userDetails) {
        throw new Error(`Could not find UserDetails for user '${auth.teamMemberId}'`);
    }

    const accountDetails: DbAccount = {
        accountId: accountId,
        name: params.name
    };
    const createAccountReq = objectDynameh.requestBuilder.buildPutInput(DbAccount.toDbObject(accountDetails));
    objectDynameh.requestBuilder.addCondition(createAccountReq, {
        operator: "attribute_not_exists",
        attribute: "pk"
    });

    const accountUser: DbAccountUser = {
        accountId: accountId,
        userId: stripUserIdTestMode(auth.teamMemberId),
        roles: getRolesForUserPrivilege("OWNER"),
        scopes: [],
        userDisplayName: userDetails.email,
        accountDisplayName: accountDetails.name,
        createdDate: createdDateNow()
    };
    const createTeamMemberReq = objectDynameh.requestBuilder.buildPutInput(DbAccountUser.toDbObject(accountUser));
    objectDynameh.requestBuilder.addCondition(createTeamMemberReq, {
        operator: "attribute_not_exists",
        attribute: "pk"
    });

    const writeReq = objectDynameh.requestBuilder.buildTransactWriteItemsInput(createAccountReq, createTeamMemberReq);
    await dynamodb.transactWriteItems(writeReq).promise();

    return accountDetails;
}

export async function updateAccountUser(auth: giftbitRoutes.jwtauth.AuthorizationBadge, userId: string, params: { roles?: string[], scopes?: string[] }): Promise<DbAccountUser> {
    auth.requireIds("userId");
    log.info("Updating AccountUser", userId, "in Account", auth.userId, "\n", params);

    const accountUser = await DbAccountUser.get(auth.userId, userId);
    if (!accountUser) {
        throw new giftbitRoutes.GiftbitRestError(cassava.httpStatusCode.clientError.NOT_FOUND, `Could not find user with id '${userId}'.`, "UserNotFound");
    }

    const updates: dynameh.UpdateExpressionAction[] = [];
    if (params.roles) {
        updates.push({
            action: "put",
            attribute: "roles",
            value: params.roles
        });
        accountUser.roles = params.roles;
    }
    if (params.scopes) {
        updates.push({
            action: "put",
            attribute: "scopes",
            value: params.scopes
        });
        accountUser.scopes = params.scopes;
    }

    if (params.roles || params.scopes) {
        // This is separated from the above because other params might be patchable in the future.
        // Arguably we could only delete the API keys if we're strictly reducing their permissions,
        // but that seems like it might be more subtle and confusing.  This is easier to explain.
        log.info("Updating roles or scopes for TeamMember", userId, "in Account", auth.userId, "has triggered deleting all of their API keys");
        await deleteApiKeysForUser(auth, userId);
    }

    if (updates.length) {
        await DbAccountUser.update(accountUser, ...updates);
    }
    return accountUser;
}

export async function removeAccountUser(auth: giftbitRoutes.jwtauth.AuthorizationBadge, teamMemberId: string): Promise<void> {
    auth.requireIds("userId");
    log.info("Removing TeamMember", teamMemberId, "from Account", auth.userId);

    const accountUser = await DbAccountUser.get(auth.userId, teamMemberId);
    if (!accountUser) {
        throw new giftbitRoutes.GiftbitRestError(cassava.httpStatusCode.clientError.NOT_FOUND, `Could not find user with id '${teamMemberId}'.`, "UserNotFound");
    }
    if (accountUser.invitation) {
        log.info("The user is invited but not a full member");
        throw new giftbitRoutes.GiftbitRestError(cassava.httpStatusCode.clientError.NOT_FOUND, `Could not find user with id '${teamMemberId}'.`, "UserNotFound");
    }

    await deleteApiKeysForUser(auth, teamMemberId);

    try {
        await DbAccountUser.del(accountUser, {
            attribute: "invitation",
            operator: "attribute_not_exists"
        });
    } catch (error) {
        if (error.code === "ConditionalCheckFailedException") {
            log.info("The user is invited but not a full member");
            throw new giftbitRoutes.GiftbitRestError(cassava.httpStatusCode.clientError.NOT_FOUND, `Could not find user with id '${teamMemberId}'.`, "UserNotFound");
        }
        throw error;
    }
}
