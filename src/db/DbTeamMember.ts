import {dynamodb, objectDynameh, objectDynameh2, queryAll} from "./dynamodb";
import {stripUserIdTestMode} from "../utils/userUtils";
import {DbObject} from "./DbObject";
import {DbUserLogin} from "./DbUserLogin";
import * as dynameh from "dynameh";
import * as giftbitRoutes from "giftbit-cassava-routes";
import log = require("loglevel");

export interface DbTeamMember {

    userId: string;
    teamMemberId: string;
    userDisplayName: string;
    accountDisplayName: string;
    invitation?: DbTeamMember.Invitation;
    roles: string[];
    scopes: string[];
    dateCreated: string;

}

export namespace DbTeamMember {

    export interface Invitation {
        email: string;
        dateCreated: string;
        dateExpires: string;
    }

    export function fromDbObject(o: DbObject): DbTeamMember {
        if (!o) {
            return null;
        }
        const teamMember = {...o};
        delete teamMember.pk;
        delete teamMember.sk;
        delete teamMember.pk2;
        delete teamMember.sk2;
        return teamMember as any;
    }

    export function toDbObject(teamMember: DbTeamMember) {
        if (!teamMember) {
            return null;
        }
        return {
            ...teamMember,
            ...getKeys(teamMember)
        };
    }

    export function getKeys(teamMember: DbTeamMember): DbObject {
        if (!teamMember || !teamMember.userId || !teamMember.teamMemberId) {
            throw new Error("Not a valid TeamMember.");
        }
        return {
            pk: "Account/" + teamMember.userId,
            sk: "TeamMemberUser/" + teamMember.teamMemberId,
            pk2: "User/" + teamMember.teamMemberId,
            sk2: "TeamMemberAccount/" + teamMember.userId,
        }
    }

    export async function get(userId: string, teamMemberId: string): Promise<DbTeamMember> {
        return fromDbObject(await DbObject.get("Account/" + stripUserIdTestMode(userId), "TeamMemberUser/" + stripUserIdTestMode(teamMemberId)));
    }

    export async function update(teamMember: DbTeamMember, ...actions: dynameh.UpdateExpressionAction[]): Promise<void> {
        const req = objectDynameh.requestBuilder.buildUpdateInputFromActions(getKeys(teamMember), ...actions);
        objectDynameh.requestBuilder.addCondition(req, {
            attribute: "pk",
            operator: "attribute_exists"
        });
        await dynamodb.updateItem(req).promise();
    }

    export async function del(teamMember: DbTeamMember, ...conditions: dynameh.Condition[]): Promise<void> {
        const req = objectDynameh.requestBuilder.buildDeleteInput(getKeys(teamMember));
        if (conditions && conditions.length) {
            objectDynameh.requestBuilder.addCondition(req, ...conditions);
        }
        await dynamodb.deleteItem(req).promise();
    }

    export async function getByAuth(auth: giftbitRoutes.jwtauth.AuthorizationBadge): Promise<DbTeamMember> {
        auth.requireIds("userId", "teamMemberId");
        return get(auth.userId, auth.teamMemberId);
    }

    /**
     * Get all users on the given team.
     */
    export async function getAccountTeamMembers(accountUserId: string): Promise<DbTeamMember[]> {
        const req = objectDynameh.requestBuilder.buildQueryInput("Account/" + stripUserIdTestMode(accountUserId), "begins_with", "TeamMemberUser/");
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
    export async function getAccountInvitedTeamMembers(accountUserId: string): Promise<DbTeamMember[]> {
        const req = objectDynameh.requestBuilder.buildQueryInput("Account/" + stripUserIdTestMode(accountUserId), "begins_with", "TeamMemberUser/");
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
    export async function getUserTeamMemberships(teamMemberId: string): Promise<DbTeamMember[]> {
        const req = objectDynameh2.requestBuilder.buildQueryInput("User/" + stripUserIdTestMode(teamMemberId), "begins_with", "TeamMemberAccount/");
        objectDynameh.requestBuilder.addFilter(req, {
            attribute: "invitation",
            operator: "attribute_not_exists"
        });

        const dbObjects = await queryAll(req);
        return dbObjects.map(fromDbObject);
    }

    /**
     * Get the team member the given user should login as.
     */
    export async function getUserLoginTeamMembership(userLogin: DbUserLogin, accountUserId?: string): Promise<DbTeamMember> {
        if (!accountUserId) {
            accountUserId = userLogin.defaultLoginUserId;
        }
        if (accountUserId) {
            const teamMember = await DbTeamMember.get(accountUserId, userLogin.userId);
            if (teamMember) {
                if (accountUserId !== userLogin.defaultLoginUserId) {
                    await DbUserLogin.update(userLogin, {
                        action: "put",
                        attribute: "defaultLoginUserId",
                        value: accountUserId
                    });
                }
                log.info("Got login team membership", accountUserId, "for User", userLogin.email);
                return teamMember;
            }
        }

        log.info("Could not find login team membership", accountUserId, "for User", userLogin.email, "; falling back to one at random");

        // Get any random TeamMember to log in as.
        const queryReq = objectDynameh2.requestBuilder.buildQueryInput(userLogin.userId);
        objectDynameh2.requestBuilder.addFilter(queryReq, {
            attribute: "invitation",
            operator: "attribute_not_exists"
        });
        queryReq.Limit = 1;
        const queryResp = await dynamodb.query(queryReq).promise();
        const teamMembers = objectDynameh2.responseUnwrapper.unwrapQueryOutput(queryResp).map(fromDbObject);
        if (teamMembers && teamMembers.length) {
            await DbUserLogin.update(userLogin, {
                action: "put",
                attribute: "defaultLoginUserId",
                value: teamMembers[0].userId
            });
            return teamMembers[0];
        }

        return null;
    }
}
