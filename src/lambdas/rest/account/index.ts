import * as aws from "aws-sdk";
import * as cassava from "cassava";
import * as dynameh from "dynameh";
import * as giftbitRoutes from "giftbit-cassava-routes";
import {DbAccountUser} from "../../../db/DbAccountUser";
import {Invitation} from "../../../model/Invitation";
import {createdDateNow, dynamodb, objectDynameh} from "../../../db/dynamodb";
import {sendTeamInvitation} from "./sendTeamInvitationEmail";
import {isTestModeUserId, stripUserIdTestMode} from "../../../utils/userUtils";
import {DbUserLogin} from "../../../db/DbUserLogin";
import {DbUser} from "../../../db/DbUser";
import {deleteApiKeysForUser} from "../apiKeys";
import {UserAccount} from "../../../model/UserAccount";
import {AccountUser} from "../../../model/AccountUser";
import {DbAccount} from "../../../db/DbAccount";
import {Account} from "../../../model/Account";
import {getRolesForUserPrivilege, UserPrivilege} from "../../../utils/rolesUtils";
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
                        maxLength: 1024
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
            const userAccounts = await DbAccountUser.getUserTeamMemberships(auth.teamMemberId);
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
                    userId: {
                        type: "string",
                        minLength: 1
                    }
                },
                required: [],
                additionalProperties: false
            });

            const userLogin = await DbUserLogin.getByAuth(auth);
            const teamMember = await DbAccountUser.getUserLoginTeamMembership(userLogin, evt.body.userId);
            let liveMode = evt.body.mode === "live" || (!evt.body.mode && evt.body.userId && isTestModeUserId(evt.body.userId));
            const userBadge = DbUserLogin.getBadge(teamMember, liveMode, true);

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
            const teamMembers = await DbAccountUser.getAccountTeamMembers(auth.userId);
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

            const teamMember = await updateTeamMember(auth, evt.pathParameters.id, evt.body);
            return {
                body: AccountUser.fromDbAccountUser(teamMember)
            };
        });

    router.route("/v2/account/users/{id}")
        .method("DELETE")
        .handler(async evt => {
            const auth: giftbitRoutes.jwtauth.AuthorizationBadge = evt.meta["auth"];
            auth.requireScopes("lightrailV2:account:users:delete");
            await removeTeamMember(auth, evt.pathParameters.id);
            return {
                body: {}
            };
        });

    router.route("/v2/account/invites")
        .method("POST")
        .handler(async evt => {
            const auth: giftbitRoutes.jwtauth.AuthorizationBadge = evt.meta["auth"];
            auth.requireScopes("lightrailV2:account:users:create");

            evt.validateBody({
                properties: {
                    email: {
                        type: "string",
                        format: "email"
                    },
                    userPrivilegeType: {
                        type: "string",
                        enum: ["OWNER", "FULL_ACCESS", "LIMITED_ACCESS"]
                    },
                    roles: {
                        type: "array",
                        items: {
                            type: "string",
                            minLength: 1,
                            maxLength: 255
                        }
                    },
                    scopes: {
                        type: "array",
                        items: {
                            type: "string",
                            minLength: 1,
                            maxLength: 255
                        }
                    }
                },
                required: ["email"],
                additionalProperties: false
            });

            const invitation = await inviteUser(auth, evt.body);
            return {
                body: invitation,
                statusCode: cassava.httpStatusCode.success.CREATED
            };
        });

    router.route("/v2/account/invites")
        .method("GET")
        .handler(async evt => {
            const auth: giftbitRoutes.jwtauth.AuthorizationBadge = evt.meta["auth"];
            auth.requireScopes("lightrailV2:account:users:list");
            const invites = await listInvites(auth);
            return {
                body: invites
            };
        });

    router.route("/v2/account/invites/{id}")
        .method("GET")
        .handler(async evt => {
            const auth: giftbitRoutes.jwtauth.AuthorizationBadge = evt.meta["auth"];
            auth.requireScopes("lightrailV2:account:users:read");
            const invite = await getInvite(auth, evt.pathParameters.id);
            if (!invite) {
                throw new giftbitRoutes.GiftbitRestError(cassava.httpStatusCode.clientError.NOT_FOUND, `Could not find invite with id '${evt.pathParameters.id}'.`, "InviteNotFound");
            }
            return {
                body: invite
            };
        });

    router.route("/v2/account/invites/{id}")
        .method("DELETE")
        .handler(async evt => {
            const auth: giftbitRoutes.jwtauth.AuthorizationBadge = evt.meta["auth"];
            auth.requireScopes("lightrailV2:account:users:delete");
            await cancelInvite(auth, evt.pathParameters.id);
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

        const teamMembers = await DbAccountUser.getAccountTeamMembers(auth.userId);
        for (const teamMember of teamMembers) {
            try {
                await DbAccountUser.update(teamMember, {
                    attribute: "accountDisplayName",
                    action: "put",
                    value: params.name
                });
            } catch (error) {
                log.error("Unable to change accountDisplayName for team member", teamMember.userId, teamMember.teamMemberId, "\n", error);
            }
        }
    }

    return account;
}

async function createAccount(auth: giftbitRoutes.jwtauth.AuthorizationBadge, params: { name: string }): Promise<DbAccount> {
    auth.requireIds("teamMemberId");
    const userId = DbUser.generateUserId();
    log.info("Creating new Account", userId, "for existing user", auth.teamMemberId);

    const userDetails = await DbUser.getByAuth(auth);
    if (!userDetails) {
        throw new Error(`Could not find UserDetails for user '${auth.teamMemberId}'`);
    }

    const accountDetails: DbAccount = {
        userId,
        name: params.name
    };
    const createAccountReq = objectDynameh.requestBuilder.buildPutInput(DbAccount.toDbObject(accountDetails));
    objectDynameh.requestBuilder.addCondition(createAccountReq, {
        operator: "attribute_not_exists",
        attribute: "pk"
    });

    const teamMember: DbAccountUser = {
        userId,
        teamMemberId: stripUserIdTestMode(auth.teamMemberId),
        roles: getRolesForUserPrivilege("OWNER"),
        scopes: [],
        userDisplayName: userDetails.email,
        accountDisplayName: accountDetails.name,
        createdDate: createdDateNow()
    };
    const createTeamMemberReq = objectDynameh.requestBuilder.buildPutInput(DbAccountUser.toDbObject(teamMember));
    objectDynameh.requestBuilder.addCondition(createTeamMemberReq, {
        operator: "attribute_not_exists",
        attribute: "pk"
    });

    const writeReq = objectDynameh.requestBuilder.buildTransactWriteItemsInput(createAccountReq, createTeamMemberReq);
    await dynamodb.transactWriteItems(writeReq).promise();

    return accountDetails;
}

export async function inviteUser(auth: giftbitRoutes.jwtauth.AuthorizationBadge, params: { email: string, userPrivilegeType?: UserPrivilege, roles?: string[], scopes?: string[] }): Promise<Invitation> {
    auth.requireIds("userId");
    const accountUserId = stripUserIdTestMode(auth.userId);
    log.info("Inviting User", params.email, "to Account", accountUserId);

    const accountDetails = await DbAccount.get(auth.userId);
    if (!accountDetails) {
        throw new Error(`Could not find AccountDetails for authed userId '${auth.userId}'`);
    }

    const updates: (aws.DynamoDB.PutItemInput | aws.DynamoDB.DeleteItemInput | aws.DynamoDB.UpdateItemInput)[] = [];
    const createdDate = createdDateNow();

    let userLogin = await DbUserLogin.get(params.email);
    if (userLogin) {
        log.info("Inviting existing User", userLogin.userId);
    } else {
        const userId = DbUser.generateUserId();
        userLogin = {
            email: params.email,
            userId,
            emailVerified: false,
            frozen: false,
            defaultLoginUserId: accountUserId,
            createdDate
        };
        const putUserReq = objectDynameh.requestBuilder.buildPutInput(DbUserLogin.toDbObject(userLogin));
        objectDynameh.requestBuilder.addCondition(putUserReq, {
            attribute: "pk",
            operator: "attribute_not_exists"
        });
        updates.push(putUserReq);

        const userDetails: DbUser = {
            userId,
            email: params.email
        };
        const putUserDetailsReq = objectDynameh.requestBuilder.buildPutInput(DbUser.toDbObject(userDetails));
        objectDynameh.requestBuilder.addCondition(putUserDetailsReq, {
            attribute: "pk",
            operator: "attribute_not_exists"
        });
        updates.push(putUserDetailsReq);

        log.info("Inviting new User", userLogin.userId);
    }

    let teamMember = await DbAccountUser.get(accountUserId, userLogin.userId);
    if (teamMember) {
        log.info("Inviting existing TeamMember", teamMember.userId, teamMember.teamMemberId);
        if (teamMember.invitation) {
            const updateTeamMemberReq = objectDynameh.requestBuilder.buildUpdateInputFromActions(
                DbAccountUser.getKeys(teamMember),
                {
                    action: "put",
                    attribute: "invitation.createdDate",
                    value: createdDate
                });
            updates.push(updateTeamMemberReq);
            log.info("Resending invitation to invited TeamMember", teamMember.userId, teamMember.teamMemberId);
        } else {
            throw new giftbitRoutes.GiftbitRestError(cassava.httpStatusCode.clientError.CONFLICT, `The user ${params.email} has already accepted an invitation.`);
        }
    } else {
        if (params.userPrivilegeType && params.roles) {
            throw new giftbitRoutes.GiftbitRestError(cassava.httpStatusCode.clientError.UNPROCESSABLE_ENTITY, "Cannot specify both userPrivilegeType and roles.");
        }
        if (!params.userPrivilegeType && !(params.roles && params.roles.length) && !(params.scopes && params.scopes.length)) {
            throw new giftbitRoutes.GiftbitRestError(cassava.httpStatusCode.clientError.UNPROCESSABLE_ENTITY, "Must specify userPrivilegeType or one of roles, scopes.");
        }
        const roles = (params.userPrivilegeType && getRolesForUserPrivilege(params.userPrivilegeType)) || params.roles;
        const scopes = params.scopes || [];

        const expiresDate = new Date();
        expiresDate.setDate(expiresDate.getDate() + 5);
        teamMember = {
            userId: accountUserId,
            teamMemberId: userLogin.userId,
            userDisplayName: params.email,
            accountDisplayName: accountDetails.name,
            invitation: {
                email: params.email,
                createdDate,
                expiresDate: expiresDate.toISOString()
            },
            roles,
            scopes,
            createdDate
        };
        const putTeamMemberReq = objectDynameh.requestBuilder.buildPutInput(DbAccountUser.toDbObject(teamMember));
        objectDynameh.requestBuilder.addCondition(putTeamMemberReq, {
            attribute: "userId",
            operator: "attribute_not_exists"
        });
        updates.push(putTeamMemberReq);
        log.info("Inviting new TeamMember", teamMember.userId, teamMember.teamMemberId);
    }

    const writeReq = objectDynameh.requestBuilder.buildTransactWriteItemsInput(...updates);
    await dynamodb.transactWriteItems(writeReq).promise();

    await sendTeamInvitation({email: params.email, userId: accountUserId, teamMemberId: userLogin.userId});

    return Invitation.fromDbAccountUser(teamMember);
}

export async function updateTeamMember(auth: giftbitRoutes.jwtauth.AuthorizationBadge, teamMemberId: string, params: { roles?: string[], scopes?: string[] }): Promise<DbAccountUser> {
    auth.requireIds("userId");
    log.info("Updating TeamMember", teamMemberId, "in Account", auth.userId, "\n", params);

    const teamMember = await DbAccountUser.get(auth.userId, teamMemberId);
    if (!teamMember) {
        throw new giftbitRoutes.GiftbitRestError(cassava.httpStatusCode.clientError.NOT_FOUND, `Could not find user with id '${teamMemberId}'.`, "UserNotFound");
    }

    const updates: dynameh.UpdateExpressionAction[] = [];
    if (params.roles) {
        updates.push({
            action: "put",
            attribute: "roles",
            value: params.roles
        });
        teamMember.roles = params.roles;
    }
    if (params.scopes) {
        updates.push({
            action: "put",
            attribute: "scopes",
            value: params.scopes
        });
        teamMember.scopes = params.scopes;
    }

    if (params.roles || params.scopes) {
        // This is separated from the above because other params might be patchable in the future.
        // Arguably we could only delete the API keys if we're strictly reducing their permissions,
        // but that seems like it might be more subtle and confusing.  This is easier to explain.
        log.info("Updating roles or scopes for TeamMember", teamMemberId, "in Account", auth.userId, "has triggered deleting all of their API keys");
        await deleteApiKeysForUser(auth, teamMemberId);
    }

    if (updates.length) {
        await DbAccountUser.update(teamMember, ...updates);
    }
    return teamMember;
}

export async function removeTeamMember(auth: giftbitRoutes.jwtauth.AuthorizationBadge, teamMemberId: string): Promise<void> {
    auth.requireIds("userId");
    log.info("Removing TeamMember", teamMemberId, "from Account", auth.userId);

    const teamMember = await DbAccountUser.get(auth.userId, teamMemberId);
    if (!teamMember) {
        throw new giftbitRoutes.GiftbitRestError(cassava.httpStatusCode.clientError.NOT_FOUND, `Could not find user with id '${teamMemberId}'.`, "UserNotFound");
    }
    if (teamMember.invitation) {
        log.info("The user is invited but not a full team member");
        throw new giftbitRoutes.GiftbitRestError(cassava.httpStatusCode.clientError.NOT_FOUND, `Could not find user with id '${teamMemberId}'.`, "UserNotFound");
    }

    await deleteApiKeysForUser(auth, teamMemberId);

    try {
        await DbAccountUser.del(teamMember, {
            attribute: "invitation",
            operator: "attribute_not_exists"
        });
    } catch (error) {
        if (error.code === "ConditionalCheckFailedException") {
            log.info("The user is invited but not a full team member");
            throw new giftbitRoutes.GiftbitRestError(cassava.httpStatusCode.clientError.NOT_FOUND, `Could not find user with id '${teamMemberId}'.`, "UserNotFound");
        }
        throw error;
    }
}

export async function listInvites(auth: giftbitRoutes.jwtauth.AuthorizationBadge): Promise<Invitation[]> {
    auth.requireIds("userId");
    const teamMembers = await DbAccountUser.getAccountInvitedTeamMembers(auth.userId);
    return teamMembers.map(Invitation.fromDbAccountUser);
}

export async function getInvite(auth: giftbitRoutes.jwtauth.AuthorizationBadge, teamMemberId: string): Promise<Invitation> {
    auth.requireIds("userId");
    const teamMember = await DbAccountUser.get(auth.userId, teamMemberId);
    if (!teamMember || !teamMember.invitation) {
        return null;
    }
    return Invitation.fromDbAccountUser(teamMember);
}

export async function cancelInvite(auth: giftbitRoutes.jwtauth.AuthorizationBadge, teamMemberId: string): Promise<void> {
    auth.requireIds("userId");
    log.info("Cancel invitation", auth.userId, teamMemberId);

    const teamMember = await DbAccountUser.get(auth.userId, teamMemberId);
    if (!teamMember) {
        throw new giftbitRoutes.GiftbitRestError(cassava.httpStatusCode.clientError.NOT_FOUND, `Could not find user with id '${teamMemberId}'.`, "UserNotFound");
    }
    if (!teamMember.invitation) {
        throw new giftbitRoutes.GiftbitRestError(cassava.httpStatusCode.clientError.CONFLICT, "The invitation cannot be deleted because it was already accepted.", "InvitationAccepted");
    }

    try {
        await DbAccountUser.del(teamMember, {
            attribute: "invitation",
            operator: "attribute_exists"
        });
    } catch (error) {
        if (error.code === "ConditionalCheckFailedException") {
            log.info("The invitation cannot be deleted because it was already accepted");
            throw new giftbitRoutes.GiftbitRestError(cassava.httpStatusCode.clientError.CONFLICT, "The invitation cannot be deleted because it was already accepted.", "InvitationAccepted");
        }
        throw error;
    }
}
