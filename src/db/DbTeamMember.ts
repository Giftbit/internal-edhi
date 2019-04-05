import {dynamodb, objectDynameh, objectReverseIndexDynameh, queryAll} from "./dynamodb";
import {stripUserIdTestMode} from "../utils/userUtils";
import {DbObject} from "./DbObject";
import {DbUserLogin} from "./DbUserLogin";
import * as dynameh from "dynameh";

export interface DbTeamMember {

    userId: string;
    teamMemberId: string;
    invitation?: DbTeamMember.Invitation;
    roles: string[];
    scopes?: string[];
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
            pk: "TeamMember/" + teamMember.userId,
            sk: "TeamMember/" + teamMember.teamMemberId
        }
    }

    export async function get(userId: string, teamMemberId: string): Promise<DbTeamMember> {
        return fromDbObject(await DbObject.get("TeamMember/" + stripUserIdTestMode(userId), "TeamMember/" + stripUserIdTestMode(teamMemberId)));
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
        await dynamodb.deleteItem(req);
    }

    /**
     * Get all users on the given team.
     */
    export async function getAccountTeamMembers(accountUserId: string): Promise<DbTeamMember[]> {
        const req = objectDynameh.requestBuilder.buildQueryInput("TeamMember/" + stripUserIdTestMode(accountUserId));
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
        const req = objectDynameh.requestBuilder.buildQueryInput("TeamMember/" + stripUserIdTestMode(accountUserId));
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
        const req = objectReverseIndexDynameh.requestBuilder.buildQueryInput("TeamMember/" + stripUserIdTestMode(teamMemberId));
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
    export async function getUserLoginTeamMembership(user: DbUserLogin): Promise<DbTeamMember> {
        if (user.defaultLoginUserId) {
            const teamMember = await DbTeamMember.get(user.defaultLoginUserId, user.userId);
            if (teamMember) {
                return teamMember;
            }
        }

        // Get any random TeamMember to log in as.
        const queryReq = objectReverseIndexDynameh.requestBuilder.buildQueryInput(user.userId);
        objectReverseIndexDynameh.requestBuilder.addFilter(queryReq, {
            attribute: "invitation",
            operator: "attribute_not_exists"
        });
        queryReq.Limit = 1;
        const queryResp = await dynamodb.query(queryReq).promise();
        const teamMembers = objectReverseIndexDynameh.responseUnwrapper.unwrapQueryOutput(queryResp).map(fromDbObject);
        if (teamMembers && teamMembers.length) {
            return teamMembers[0];
        }

        return null;
    }
}
