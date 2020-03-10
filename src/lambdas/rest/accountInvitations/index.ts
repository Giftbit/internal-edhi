import * as aws from "aws-sdk";
import * as cassava from "cassava";
import * as giftbitRoutes from "giftbit-cassava-routes";
import {getRolesForUserPrivilege, UserPrivilege} from "../../../utils/rolesUtils";
import {Invitation} from "../../../model/Invitation";
import {stripUserIdTestMode} from "../../../utils/userUtils";
import {DbAccount} from "../../../db/DbAccount";
import {createdDateNow, dynamodb, objectDynameh} from "../../../db/dynamodb";
import {DbUser} from "../../../db/DbUser";
import {DbUserUniqueness} from "../../../db/DbUserUniqueness";
import {DbAccountUser} from "../../../db/DbAccountUser";
import {sendAccountUserInvitation} from "./sendAccountUserInvitation";
import log = require("loglevel");

export function installAccountInvitationsRest(router: cassava.Router): void {
    router.route("/v2/account/invitations")
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

    router.route("/v2/account/invitations")
        .method("GET")
        .handler(async evt => {
            const auth: giftbitRoutes.jwtauth.AuthorizationBadge = evt.meta["auth"];
            auth.requireScopes("lightrailV2:account:users:list");
            const invitations = await listInvitations(auth);
            return {
                body: invitations
            };
        });

    router.route("/v2/account/invitations/{id}")
        .method("GET")
        .handler(async evt => {
            const auth: giftbitRoutes.jwtauth.AuthorizationBadge = evt.meta["auth"];
            auth.requireScopes("lightrailV2:account:users:read");
            const invitation = await getInvitation(auth, evt.pathParameters.id);
            if (!invitation) {
                throw new giftbitRoutes.GiftbitRestError(cassava.httpStatusCode.clientError.NOT_FOUND, `Could not find invitation with id '${evt.pathParameters.id}'.`, "InvitatonNotFound");
            }
            return {
                body: invitation
            };
        });

    router.route("/v2/account/invitations/{id}")
        .method("DELETE")
        .handler(async evt => {
            const auth: giftbitRoutes.jwtauth.AuthorizationBadge = evt.meta["auth"];
            auth.requireScopes("lightrailV2:account:users:delete");
            await cancelInvitation(auth, evt.pathParameters.id);
            return {
                body: {}
            };
        });
}

async function inviteUser(auth: giftbitRoutes.jwtauth.AuthorizationBadge, params: { email: string, userPrivilegeType?: UserPrivilege, roles?: string[], scopes?: string[] }): Promise<Invitation> {
    auth.requireIds("userId");
    const accountId = stripUserIdTestMode(auth.userId);
    log.info("Inviting User", params.email, "to Account", accountId);

    const account = await DbAccount.get(auth.userId);
    if (!account) {
        throw new Error(`Could not find Account for auth userId '${auth.userId}'`);
    }

    const updates: (aws.DynamoDB.PutItemInput | aws.DynamoDB.DeleteItemInput | aws.DynamoDB.UpdateItemInput)[] = [];
    const createdDate = createdDateNow();

    let user = await DbUser.get(params.email);
    if (user) {
        log.info("Inviting existing User", user.userId);
    } else {
        const userId = DbUser.generateUserId();
        user = {
            email: params.email,
            userId,
            login: {
                emailVerified: false,
                frozen: false,
                defaultLoginAccountId: accountId
            },
            createdDate
        };
        const putUserReq = objectDynameh.requestBuilder.buildPutInput(DbUser.toDbObject(user));
        objectDynameh.requestBuilder.addCondition(putUserReq, {
            attribute: "pk",
            operator: "attribute_not_exists"
        });
        updates.push(putUserReq);

        const userUniqueness: DbUserUniqueness = {
            userId,
            createdDate: createdDateNow()
        };
        const putUserUniquenessReq = objectDynameh.requestBuilder.buildPutInput(DbUserUniqueness.toDbObject(userUniqueness));
        objectDynameh.requestBuilder.addCondition(putUserUniquenessReq, {
            attribute: "pk",
            operator: "attribute_not_exists"
        });
        updates.push(putUserUniquenessReq);

        log.info("Inviting new User", user.userId);
    }

    let accountUser = await DbAccountUser.get(accountId, user.userId);
    if (accountUser) {
        log.info("Inviting existing AccountUser", accountUser.accountId, accountUser.userId);
        if (accountUser.pendingInvitation) {
            const updateAccountUserReq = objectDynameh.requestBuilder.buildUpdateInputFromActions(
                DbAccountUser.getKeys(accountUser),
                {
                    action: "put",
                    attribute: "pendingInvitation.createdDate",
                    value: createdDate
                });
            updates.push(updateAccountUserReq);
            log.info("Resending invitation to invited AccountUser", accountUser.accountId, accountUser.userId);
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
        accountUser = {
            accountId: accountId,
            userId: user.userId,
            userDisplayName: params.email,
            accountDisplayName: account.name,
            pendingInvitation: {
                email: params.email,
                createdDate,
                expiresDate: expiresDate.toISOString()
            },
            roles,
            scopes,
            createdDate
        };
        const putAccountUserReq = objectDynameh.requestBuilder.buildPutInput(DbAccountUser.toDbObject(accountUser));
        objectDynameh.requestBuilder.addCondition(putAccountUserReq, {
            attribute: "userId",
            operator: "attribute_not_exists"
        });
        updates.push(putAccountUserReq);
        log.info("Inviting new AccountUser", accountUser.accountId, accountUser.userId);
    }

    const writeReq = objectDynameh.requestBuilder.buildTransactWriteItemsInput(...updates);
    await dynamodb.transactWriteItems(writeReq).promise();

    await sendAccountUserInvitation({email: params.email, accountId: accountId, userId: user.userId});

    return Invitation.fromDbAccountUser(accountUser);
}

async function listInvitations(auth: giftbitRoutes.jwtauth.AuthorizationBadge): Promise<Invitation[]> {
    auth.requireIds("userId");
    const accountUsers = await DbAccountUser.getInvitationsForAccount(auth.userId);
    return accountUsers.map(Invitation.fromDbAccountUser);
}

async function getInvitation(auth: giftbitRoutes.jwtauth.AuthorizationBadge, userId: string): Promise<Invitation> {
    auth.requireIds("userId");
    const accountUser = await DbAccountUser.get(auth.userId, userId);
    if (!accountUser || !accountUser.pendingInvitation) {
        return null;
    }
    return Invitation.fromDbAccountUser(accountUser);
}

async function cancelInvitation(auth: giftbitRoutes.jwtauth.AuthorizationBadge, userId: string): Promise<void> {
    auth.requireIds("userId");
    log.info("Cancel invitation", auth.userId, userId);

    const accountUser = await DbAccountUser.get(auth.userId, userId);
    if (!accountUser) {
        throw new giftbitRoutes.GiftbitRestError(cassava.httpStatusCode.clientError.NOT_FOUND, `Could not find user with id '${userId}'.`, "UserNotFound");
    }
    if (!accountUser.pendingInvitation) {
        throw new giftbitRoutes.GiftbitRestError(cassava.httpStatusCode.clientError.CONFLICT, "The invitation cannot be deleted because it was already accepted.", "InvitationAccepted");
    }

    try {
        await DbAccountUser.del(accountUser, {
            attribute: "pendingInvitation",
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
