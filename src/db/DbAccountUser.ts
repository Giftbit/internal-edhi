import * as dynameh from "dynameh";
import * as giftbitRoutes from "giftbit-cassava-routes";
import {dynamodb, objectDynameh, objectDynameh2, queryAll} from "./dynamodb";
import {stripUserIdTestMode} from "../utils/userUtils";
import {DbObject} from "./DbObject";
import {DbUserLogin} from "./DbUserLogin";
import log = require("loglevel");

export interface DbAccountUser {

    accountId: string;
    userId: string;
    userDisplayName: string;
    accountDisplayName: string;
    invitation?: DbAccountUser.Invitation;
    roles: string[];
    scopes: string[];
    createdDate: string;

}

export namespace DbAccountUser {

    export interface Invitation {
        email: string;
        createdDate: string;
        expiresDate: string;
    }

    export function fromDbObject(o: DbObject): DbAccountUser {
        if (!o) {
            return null;
        }
        const accountUser = {...o};
        delete accountUser.pk;
        delete accountUser.sk;
        delete accountUser.pk2;
        delete accountUser.sk2;
        return accountUser as any;
    }

    export function toDbObject(accountUser: DbAccountUser): DbAccountUser & DbObject {
        if (!accountUser) {
            return null;
        }
        return {
            ...accountUser,
            ...getKeys(accountUser)
        };
    }

    export function getKeys(accountUser: DbAccountUser): DbObject {
        if (!accountUser || !accountUser.accountId || !accountUser.userId) {
            throw new Error("Not a valid AccountUser.");
        }
        return {
            pk: "Account/" + accountUser.accountId,
            sk: "AccountUser/" + accountUser.userId,
            pk2: "User/" + accountUser.userId,
            sk2: "AccountUser/" + accountUser.accountId,
        };
    }

    export async function get(accountId: string, userId: string): Promise<DbAccountUser> {
        return fromDbObject(await DbObject.get("Account/" + stripUserIdTestMode(accountId), "AccountUser/" + stripUserIdTestMode(userId)));
    }

    export async function update(accountUser: DbAccountUser, ...actions: dynameh.UpdateExpressionAction[]): Promise<void> {
        const req = objectDynameh.requestBuilder.buildUpdateInputFromActions(getKeys(accountUser), ...actions);
        objectDynameh.requestBuilder.addCondition(req, {
            attribute: "pk",
            operator: "attribute_exists"
        });
        await dynamodb.updateItem(req).promise();
    }

    export async function del(accountUser: DbAccountUser, ...conditions: dynameh.Condition[]): Promise<void> {
        const req = objectDynameh.requestBuilder.buildDeleteInput(getKeys(accountUser));
        if (conditions && conditions.length) {
            objectDynameh.requestBuilder.addCondition(req, ...conditions);
        }
        await dynamodb.deleteItem(req).promise();
    }

    export async function getByAuth(auth: giftbitRoutes.jwtauth.AuthorizationBadge): Promise<DbAccountUser> {
        auth.requireIds("userId", "teamMemberId");
        return get(auth.userId, auth.teamMemberId);
    }

    /**
     * Get all users on the given team.
     */
    export async function getAllForAccount(accountUserId: string): Promise<DbAccountUser[]> {
        const req = objectDynameh.requestBuilder.buildQueryInput("Account/" + stripUserIdTestMode(accountUserId), "begins_with", "AccountUser/");
        objectDynameh.requestBuilder.addFilter(req, {
            attribute: "invitation",
            operator: "attribute_not_exists"
        });

        const dbObjects = await queryAll(req);
        return dbObjects.map(fromDbObject);
    }

    /**
     * Get invited users on the given team.
     */
    export async function getInvitedForAccount(accountUserId: string): Promise<DbAccountUser[]> {
        const req = objectDynameh.requestBuilder.buildQueryInput("Account/" + stripUserIdTestMode(accountUserId), "begins_with", "AccountUser/");
        objectDynameh.requestBuilder.addFilter(req, {
            attribute: "invitation",
            operator: "attribute_exists"
        });

        const dbObjects = await queryAll(req);
        return dbObjects.map(fromDbObject);
    }

    /**
     * Get all teams for the given user.
     */
    export async function getAllForUser(userId: string): Promise<DbAccountUser[]> {
        const req = objectDynameh2.requestBuilder.buildQueryInput("User/" + stripUserIdTestMode(userId), "begins_with", "AccountUser/");
        objectDynameh.requestBuilder.addFilter(req, {
            attribute: "invitation",
            operator: "attribute_not_exists"
        });

        const dbObjects = await queryAll(req);
        return dbObjects.map(fromDbObject);
    }

    /**
     * Get the AccountUser the given User should login as.
     */
    export async function getForUserLogin(userLogin: DbUserLogin): Promise<DbAccountUser> {
        if (userLogin.defaultLoginAccountId) {
            const accountUser = await DbAccountUser.get(userLogin.defaultLoginAccountId, userLogin.userId);
            if (accountUser && !accountUser.invitation) {
                log.info("Got login AccountUser", userLogin.defaultLoginAccountId, "for User", userLogin.email);
                return accountUser;
            }
        }

        log.info("Could not find login AccountUser", userLogin.defaultLoginAccountId, "for User", userLogin.email, "; falling back to one at random");

        // Get any random AccountUser to log in as.
        const queryReq = objectDynameh2.requestBuilder.buildQueryInput(userLogin.userId);
        objectDynameh2.requestBuilder.addFilter(queryReq, {
            attribute: "invitation",
            operator: "attribute_not_exists"
        });
        queryReq.Limit = 1;
        const queryResp = await dynamodb.query(queryReq).promise();
        const accountUsers = objectDynameh2.responseUnwrapper.unwrapQueryOutput(queryResp).map(fromDbObject);
        if (accountUsers && accountUsers.length) {
            await DbUserLogin.update(userLogin, {
                action: "put",
                attribute: "defaultLoginUserId",
                value: accountUsers[0].accountId
            });
            return accountUsers[0];
        }

        return null;
    }
}
