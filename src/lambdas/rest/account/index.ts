import * as aws from "aws-sdk";
import * as cassava from "cassava";
import * as dynameh from "dynameh";
import * as giftbitRoutes from "giftbit-cassava-routes";
import {DbTeamMember} from "../../../db/DbTeamMember";
import {Invitation} from "../../../model/Invitation";
import {dateCreatedNow, dynamodb, objectDynameh} from "../../../db/dynamodb";
import {sendTeamInvitation} from "./sendTeamInvitationEmail";
import {isTestModeUserId, stripUserIdTestMode} from "../../../utils/userUtils";
import {DbUserLogin} from "../../../db/DbUserLogin";
import {DbUserDetails} from "../../../db/DbUserDetails";
import {deleteApiKeysForUser} from "../apiKeys";
import {UserAccount} from "../../../model/UserAccount";
import {AccountUser} from "../../../model/AccountUser";
import {DbAccountDetails} from "../../../db/DbAccountDetails";
import {Account} from "../../../model/Account";
import log = require("loglevel");

export function installAccountRest(router: cassava.Router): void {
    router.route("/v2/account")
        .method("GET")
        .handler(async evt => {
            const auth: giftbitRoutes.jwtauth.AuthorizationBadge = evt.meta["auth"];
            auth.requireIds("userId");
            const account = await DbAccountDetails.get(auth.userId);
            return {
                body: Account.getFromDbAccountDetails(account)
            };
        });

    router.route("/v2/account")
        .method("PATCH")
        .handler(async evt => {
            const auth: giftbitRoutes.jwtauth.AuthorizationBadge = evt.meta["auth"];

            evt.validateBody({
                properties: {
                    name: {
                        type: "string",
                        minLength: 1
                    }
                },
                required: [],
                additionalProperties: false
            });

            const account = await updateAccount(auth, evt.body);
            return {
                body: Account.getFromDbAccountDetails(account)
            };
        });

    router.route("/v2/account/switch")
        .method("GET")
        .handler(async evt => {
            const auth: giftbitRoutes.jwtauth.AuthorizationBadge = evt.meta["auth"];
            auth.requireIds("teamMemberId");
            const userAccounts = await DbTeamMember.getUserTeamMemberships(auth.teamMemberId);
            return {
                body: userAccounts.map(UserAccount.fromDbTeamMember)
            };
        });

    router.route("/v2/account/switch")
        .method("POST")
        .handler(async evt => {
            const auth: giftbitRoutes.jwtauth.AuthorizationBadge = evt.meta["auth"];
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
            const teamMember = await DbTeamMember.getUserLoginTeamMembership(userLogin, evt.body.userId);
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
            auth.requireIds("userId");
            const teamMembers = await DbTeamMember.getAccountTeamMembers(auth.userId);
            return {
                body: teamMembers.map(AccountUser.fromDbTeamMember)
            };
        });

    router.route("/v2/account/users/{id}")
        .method("GET")
        .handler(async evt => {
            const auth: giftbitRoutes.jwtauth.AuthorizationBadge = evt.meta["auth"];
            auth.requireIds("userId");
            const teamMember = await DbTeamMember.get(auth.userId, evt.pathParameters.id);
            if (!teamMember || teamMember.invitation) {
                throw new giftbitRoutes.GiftbitRestError(cassava.httpStatusCode.clientError.NOT_FOUND, `Could not find user with id '${evt.pathParameters.id}'.`, "UserNotFound");
            }
            return {
                body: AccountUser.fromDbTeamMember(teamMember)
            };
        });

    router.route("/v2/account/users/{id}")
        .method("PATCH")
        .handler(async evt => {
            const auth: giftbitRoutes.jwtauth.AuthorizationBadge = evt.meta["auth"];

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
                body: AccountUser.fromDbTeamMember(teamMember)
            };
        });

    router.route("/v2/account/users/{id}")
        .method("DELETE")
        .handler(async evt => {
            const auth: giftbitRoutes.jwtauth.AuthorizationBadge = evt.meta["auth"];
            await removeTeamMember(auth, evt.pathParameters.id);
            return {
                body: {}
            };
        });

    router.route("/v2/account/invites")
        .method("POST")
        .handler(async evt => {
            const auth: giftbitRoutes.jwtauth.AuthorizationBadge = evt.meta["auth"];

            evt.validateBody({
                properties: {
                    email: {
                        type: "string",
                        format: "email"
                    },
                    access: {
                        type: "string",
                        enum: ["owner", "full", "limited"]
                    }
                },
                required: ["email", "access"],
                additionalProperties: false
            });

            const invitation = await inviteUser(auth, evt.body.email, evt.body.access);
            return {
                body: invitation,
                statusCode: cassava.httpStatusCode.success.CREATED
            };
        });

    router.route("/v2/account/invites")
        .method("GET")
        .handler(async evt => {
            const auth: giftbitRoutes.jwtauth.AuthorizationBadge = evt.meta["auth"];
            const invites = await listInvites(auth);
            return {
                body: invites
            }
        });

    router.route("/v2/account/invites/{id}")
        .method("GET")
        .handler(async evt => {
            const auth: giftbitRoutes.jwtauth.AuthorizationBadge = evt.meta["auth"];
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
            await cancelInvite(auth, evt.pathParameters.id);
            return {
                body: {}
            };
        });
}

async function updateAccount(auth: giftbitRoutes.jwtauth.AuthorizationBadge, params: { name?: string }): Promise<DbAccountDetails> {
    auth.requireIds("userId");
    log.info("Updating Account", auth.userId);

    const account = await DbAccountDetails.get(auth.userId);
    if (!account) {
        throw new Error(`Could not find DbAccountDetails for user '${auth.userId}'`);
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

    await DbAccountDetails.update(account, ...updates);

    // Update non-authoritative data.
    if (params.name) {
        log.info("Updating TeamMember.accountDisplayName for Account", auth.userId);

        const teamMembers = await DbTeamMember.getAccountTeamMembers(auth.userId);
        for (const teamMember of teamMembers) {
            try {
                await DbTeamMember.update(teamMember, {
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

export async function inviteUser(auth: giftbitRoutes.jwtauth.AuthorizationBadge, email: string, access: "owner" | "full" | "limited"): Promise<Invitation> {
    auth.requireIds("userId");
    const accountUserId = stripUserIdTestMode(auth.userId);
    log.info("Inviting User", email, "to Account", accountUserId);

    const accountDetails = await DbAccountDetails.get(auth.userId);
    if (!accountDetails) {
        throw new Error(`Could not find AccountDetails for authed userId '${auth.userId}'`);
    }

    const updates: (aws.DynamoDB.PutItemInput | aws.DynamoDB.DeleteItemInput | aws.DynamoDB.UpdateItemInput)[] = [];
    const dateCreated = dateCreatedNow();

    let userLogin = await DbUserLogin.get(email);
    if (userLogin) {
        log.info("Inviting existing User", userLogin.userId);
    } else {
        const userId = DbUserDetails.generateUserId();
        userLogin = {
            email,
            userId,
            emailVerified: false,
            frozen: false,
            defaultLoginUserId: accountUserId,
            dateCreated
        };
        const putUserReq = objectDynameh.requestBuilder.buildPutInput(DbUserLogin.toDbObject(userLogin));
        objectDynameh.requestBuilder.addCondition(putUserReq, {
            attribute: "pk",
            operator: "attribute_not_exists"
        });
        updates.push(putUserReq);

        const userDetails: DbUserDetails = {
            userId,
            email
        };
        const putUserDetailsReq = objectDynameh.requestBuilder.buildPutInput(DbUserDetails.toDbObject(userDetails));
        objectDynameh.requestBuilder.addCondition(putUserDetailsReq, {
            attribute: "pk",
            operator: "attribute_not_exists"
        });
        updates.push(putUserDetailsReq);

        log.info("Inviting new User", userLogin.userId);
    }

    let teamMember = await DbTeamMember.get(accountUserId, userLogin.userId);
    if (teamMember) {
        log.info("Inviting existing TeamMember", teamMember.userId, teamMember.teamMemberId);
        if (teamMember.invitation) {
            const updateTeamMemberReq = objectDynameh.requestBuilder.buildUpdateInputFromActions(
                DbTeamMember.getKeys(teamMember),
                {
                    action: "put",
                    attribute: "invitation.dateCreated",
                    value: dateCreated
                });
            updates.push(updateTeamMemberReq);
            log.info("Resending invitation to invited TeamMember", teamMember.userId, teamMember.teamMemberId);
        } else {
            throw new giftbitRoutes.GiftbitRestError(cassava.httpStatusCode.clientError.CONFLICT, `The user ${email} has already accepted an invitation.`);
        }
    } else {
        const dateExpires = new Date();
        dateExpires.setDate(dateExpires.getDate() + 5);
        teamMember = {
            userId: accountUserId,
            teamMemberId: userLogin.userId,
            userDisplayName: email,
            accountDisplayName: accountDetails.name,
            invitation: {
                email: email,
                dateCreated,
                dateExpires: dateExpires.toISOString()
            },
            roles: [],  // TODO base on access
            scopes: [],
            dateCreated
        };
        const putTeamMemberReq = objectDynameh.requestBuilder.buildPutInput(DbTeamMember.toDbObject(teamMember));
        objectDynameh.requestBuilder.addCondition(putTeamMemberReq, {
            attribute: "userId",
            operator: "attribute_not_exists"
        });
        updates.push(putTeamMemberReq);
        log.info("Inviting new TeamMember", teamMember.userId, teamMember.teamMemberId);
    }

    const writeReq = objectDynameh.requestBuilder.buildTransactWriteItemsInput(...updates);
    await dynamodb.transactWriteItems(writeReq).promise();

    await sendTeamInvitation({email: email, userId: accountUserId, teamMemberId: userLogin.userId});

    return Invitation.fromDbTeamMember(teamMember);
}

export async function updateTeamMember(auth: giftbitRoutes.jwtauth.AuthorizationBadge, teamMemberId: string, params: { roles?: string[], scopes?: string[] }): Promise<DbTeamMember> {
    auth.requireIds("userId");
    log.info("Updating TeamMember", teamMemberId, "in Account", auth.userId, "\n", params);

    const teamMember = await DbTeamMember.get(auth.userId, teamMemberId);
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
        await DbTeamMember.update(teamMember, ...updates);
    }
    return teamMember;
}

export async function removeTeamMember(auth: giftbitRoutes.jwtauth.AuthorizationBadge, teamMemberId: string): Promise<void> {
    auth.requireIds("userId");
    log.info("Removing TeamMember", teamMemberId, "from Account", auth.userId);

    const teamMember = await DbTeamMember.get(auth.userId, teamMemberId);
    if (!teamMember) {
        throw new giftbitRoutes.GiftbitRestError(cassava.httpStatusCode.clientError.NOT_FOUND, `Could not find user with id '${teamMemberId}'.`, "UserNotFound");
    }
    if (teamMember.invitation) {
        log.info("The user is invited but not a full team member");
        throw new giftbitRoutes.GiftbitRestError(cassava.httpStatusCode.clientError.NOT_FOUND, `Could not find user with id '${teamMemberId}'.`, "UserNotFound");
    }

    await deleteApiKeysForUser(auth, teamMemberId);

    try {
        await DbTeamMember.del(teamMember, {
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
    const teamMembers = await DbTeamMember.getAccountInvitedTeamMembers(auth.userId);
    return teamMembers.map(Invitation.fromDbTeamMember);
}

export async function getInvite(auth: giftbitRoutes.jwtauth.AuthorizationBadge, teamMemberId: string): Promise<Invitation> {
    auth.requireIds("userId");
    const teamMember = await DbTeamMember.get(auth.userId, teamMemberId);
    if (!teamMember || !teamMember.invitation) {
        return null;
    }
    return Invitation.fromDbTeamMember(teamMember);
}

export async function cancelInvite(auth: giftbitRoutes.jwtauth.AuthorizationBadge, teamMemberId: string): Promise<void> {
    auth.requireIds("userId");
    log.info("Cancel invitation", auth.userId, teamMemberId);

    const teamMember = await DbTeamMember.get(auth.userId, teamMemberId);
    if (!teamMember) {
        throw new giftbitRoutes.GiftbitRestError(cassava.httpStatusCode.clientError.NOT_FOUND, `Could not find user with id '${teamMemberId}'.`, "UserNotFound")
    }
    if (!teamMember.invitation) {
        throw new giftbitRoutes.GiftbitRestError(cassava.httpStatusCode.clientError.CONFLICT, "The invitation cannot be deleted because it was already accepted.", "InvitationAccepted");
    }

    try {
        await DbTeamMember.del(teamMember, {
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
