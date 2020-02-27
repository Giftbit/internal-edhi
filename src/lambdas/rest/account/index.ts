import * as cassava from "cassava";
import * as dynameh from "dynameh";
import * as giftbitRoutes from "giftbit-cassava-routes";
import {DbAccountUser} from "../../../db/DbAccountUser";
import {createdDateNow, dynamodb, objectDynameh} from "../../../db/dynamodb";
import {setUserIdTestMode, stripUserIdTestMode} from "../../../utils/userUtils";
import {DbUserLogin} from "../../../db/DbUserLogin";
import {DbUser} from "../../../db/DbUser";
import {SwitchableAccount} from "../../../model/SwitchableAccount";
import {AccountUser} from "../../../model/AccountUser";
import {DbAccount} from "../../../db/DbAccount";
import {Account} from "../../../model/Account";
import {getRolesForUserPrivilege} from "../../../utils/rolesUtils";
import {LoginResult} from "../../../model/LoginResult";
import {getLoginResponse} from "../login";
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
                    maxInactiveDays: {
                        type: ["number", "null"],
                        minimum: 7,
                        maximum: 999
                    },
                    maxPasswordAge: {
                        type: ["number", "null"],
                        minimum: 7,
                        maximum: 999
                    },
                    name: {
                        type: "string",
                        minLength: 1,
                        maxLength: 1023
                    },
                    requireMfa: {
                        type: "boolean"
                    },
                    requirePasswordHistory: {
                        type: "boolean"
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
            const accountUsers = await DbAccountUser.getAllForUser(auth.teamMemberId);
            const currentAccount = stripUserIdTestMode(auth.userId);
            return {
                body: accountUsers.map(accountUser => SwitchableAccount.fromDbAccountUser(accountUser, accountUser.accountId === currentAccount))
            };
        });

    router.route("/v2/account/switch")
        .method("POST")
        .handler(async evt => {
            const auth: giftbitRoutes.jwtauth.AuthorizationBadge = evt.meta["auth"];
            auth.requireScopes("lightrailV2:user:read", "lightrailV2:user:update");
            auth.requireIds("teamMemberId");

            evt.validateBody({
                properties: {
                    accountId: {
                        type: "string",
                        minLength: 1
                    },
                    mode: {
                        type: "string",
                        enum: ["live", "test"]
                    }
                },
                required: ["accountId", "mode"],
                additionalProperties: false
            });

            return await switchAccount(auth, evt.body.accountId, evt.body.mode === "live");
        });

    router.route("/v2/account/users")
        .method("GET")
        .handler(async evt => {
            const auth: giftbitRoutes.jwtauth.AuthorizationBadge = evt.meta["auth"];
            auth.requireScopes("lightrailV2:account:users:list");
            auth.requireIds("userId");

            const account = await DbAccount.get(auth.userId);
            const accountUsers = await DbAccountUser.getAllForAccount(auth.userId);
            return {
                body: accountUsers.map(accountUser => AccountUser.fromDbAccountUser(account, accountUser))
            };
        });

    router.route("/v2/account/users/{id}")
        .method("GET")
        .handler(async evt => {
            const auth: giftbitRoutes.jwtauth.AuthorizationBadge = evt.meta["auth"];
            auth.requireScopes("lightrailV2:account:users:read");
            auth.requireIds("userId");

            const account = await DbAccount.get(auth.userId);
            const accountUser = await DbAccountUser.get(auth.userId, evt.pathParameters.id);
            if (!accountUser || accountUser.pendingInvitation) {
                throw new giftbitRoutes.GiftbitRestError(cassava.httpStatusCode.clientError.NOT_FOUND, `Could not find user with id '${evt.pathParameters.id}'.`, "UserNotFound");
            }
            return {
                body: AccountUser.fromDbAccountUser(account, accountUser)
            };
        });

    router.route("/v2/account/users/{id}")
        .method("PATCH")
        .handler(async evt => {
            const auth: giftbitRoutes.jwtauth.AuthorizationBadge = evt.meta["auth"];
            auth.requireScopes("lightrailV2:account:users:update");

            evt.validateBody({
                properties: {
                    lockedOnInactivity: {
                        type: "boolean"
                    },
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

            const account = await DbAccount.get(auth.userId);
            const accountUser = await updateAccountUser(auth, evt.pathParameters.id, evt.body);
            return {
                body: AccountUser.fromDbAccountUser(account, accountUser)
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

interface UpdateAccountParams {
    maxInactiveDays?: number | null;
    maxPasswordAge?: number | null;
    name?: string;
    requireMfa?: boolean;
    requirePasswordHistory?: boolean;
}

async function updateAccount(auth: giftbitRoutes.jwtauth.AuthorizationBadge, params: UpdateAccountParams): Promise<DbAccount> {
    auth.requireIds("userId");
    log.info("Updating Account", auth.userId);

    const account = await DbAccount.get(auth.userId);
    if (!account) {
        throw new Error(`Could not find DbAccount for user '${auth.userId}'`);
    }

    const updates: dynameh.UpdateExpressionAction[] = [];
    if (params.maxInactiveDays !== undefined) {
        if (params.maxInactiveDays !== null && params.maxInactiveDays <= 0) {
            throw new Error("params.maxInactiveDays can't be negative");
        }
        updates.push({
            action: "put",
            attribute: "maxInactiveDays",
            value: params.maxInactiveDays
        });
        account.maxInactiveDays = params.maxInactiveDays;
    }
    if (params.maxPasswordAge !== undefined) {
        if (params.maxPasswordAge !== null && params.maxPasswordAge <= 0) {
            throw new Error("params.maxPasswordAge can't be negative");
        }
        updates.push({
            action: "put",
            attribute: "maxPasswordAge",
            value: params.maxPasswordAge
        });
        account.maxPasswordAge = params.maxPasswordAge;
    }
    if (params.name) {
        updates.push({
            action: "put",
            attribute: "name",
            value: params.name
        });
        account.name = params.name;
    }
    if (params.requireMfa != null) {
        updates.push({
            action: "put",
            attribute: "requireMfa",
            value: params.requireMfa
        });
        account.requireMfa = params.requireMfa;
    }
    if (params.requirePasswordHistory != null) {
        updates.push({
            action: "put",
            attribute: "requirePasswordHistory",
            value: params.requirePasswordHistory
        });
        account.requirePasswordHistory = params.requirePasswordHistory;
    }

    if (!updates.length) {
        return account;
    }

    await DbAccount.update(account, ...updates);

    // Update non-authoritative data.
    if (params.name) {
        log.info("Updating all DbAccountUser.accountDisplayName for Account", auth.userId);

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

    const user = await DbUser.getByAuth(auth);
    if (!user) {
        throw new Error(`Could not find User for user '${auth.teamMemberId}'`);
    }

    const account: DbAccount = {
        accountId: accountId,
        name: params.name
    };
    const createAccountReq = objectDynameh.requestBuilder.buildPutInput(DbAccount.toDbObject(account));
    objectDynameh.requestBuilder.addCondition(createAccountReq, {
        operator: "attribute_not_exists",
        attribute: "pk"
    });

    const accountUser: DbAccountUser = {
        accountId: accountId,
        userId: stripUserIdTestMode(auth.teamMemberId),
        roles: getRolesForUserPrivilege("OWNER"),
        scopes: [],
        userDisplayName: user.email,
        accountDisplayName: account.name,
        createdDate: createdDateNow()
    };
    const createAccountUser = objectDynameh.requestBuilder.buildPutInput(DbAccountUser.toDbObject(accountUser));
    objectDynameh.requestBuilder.addCondition(createAccountUser, {
        operator: "attribute_not_exists",
        attribute: "pk"
    });

    const writeReq = objectDynameh.requestBuilder.buildTransactWriteItemsInput(createAccountReq, createAccountUser);
    await dynamodb.transactWriteItems(writeReq).promise();

    return account;
}

async function switchAccount(auth: giftbitRoutes.jwtauth.AuthorizationBadge, accountId: string, liveMode: boolean): Promise<cassava.RouterResponse & { body: LoginResult }> {
    const accountUser = await DbAccountUser.get(accountId, auth.teamMemberId);
    if (!accountUser || accountUser.pendingInvitation) {
        throw new giftbitRoutes.GiftbitRestError(cassava.httpStatusCode.clientError.FORBIDDEN);
    }

    const userLogin = await DbUserLogin.getByAuth(auth);
    await DbUserLogin.update(userLogin, {
        action: "put",
        attribute: "defaultLoginAccountId",
        value: liveMode ? stripUserIdTestMode(accountId) : setUserIdTestMode(accountId)
    });

    return getLoginResponse(userLogin, accountUser, liveMode);
}

export async function updateAccountUser(auth: giftbitRoutes.jwtauth.AuthorizationBadge, userId: string, params: { lockedOnInactivity?: boolean, roles?: string[], scopes?: string[] }): Promise<DbAccountUser> {
    auth.requireIds("userId");
    log.info("Updating AccountUser", userId, "in Account", auth.userId, "\n", params);

    const accountUser = await DbAccountUser.get(auth.userId, userId);
    if (!accountUser) {
        throw new giftbitRoutes.GiftbitRestError(cassava.httpStatusCode.clientError.NOT_FOUND, `Could not find user with id '${userId}'.`, "UserNotFound");
    }

    const updates: dynameh.UpdateExpressionAction[] = [];
    if (params.lockedOnInactivity !== undefined) {
        const lastLoginDate = params.lockedOnInactivity ? new Date(0).toISOString() : createdDateNow();
        updates.push({
            action: "put",
            attribute: "lastLoginDate",
            value: lastLoginDate
        });
        accountUser.lastLoginDate = lastLoginDate;
    }
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
    if (accountUser.pendingInvitation) {
        log.info("The user is invited but not a full member");
        throw new giftbitRoutes.GiftbitRestError(cassava.httpStatusCode.clientError.NOT_FOUND, `Could not find user with id '${teamMemberId}'.`, "UserNotFound");
    }

    try {
        await DbAccountUser.del(accountUser, {
            attribute: "pendingInvitation",
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
