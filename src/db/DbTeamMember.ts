import {dynamodb, teamMemberByTeamMemberIdDynameh, teamMemberDynameh} from "./dynamodb";
import {DbUser} from "./DbUser";
import {stripUserIdTestMode} from "../utils/userUtils";

export interface DbTeamMember {

    userId: string;
    teamMemberId: string;
    invitation?: TeamMemberInvitation;
    roles: string[];
    scopes?: string[];
    dateCreated: string;

}

export interface TeamMemberInvitation {
    email: string;
    dateCreated: string;
    dateExpires: string;
}

export namespace DbTeamMember {
    export async function get(accountUserId: string, teamMemberId: string): Promise<DbTeamMember> {
        const req = teamMemberDynameh.requestBuilder.buildGetInput(stripUserIdTestMode(accountUserId), stripUserIdTestMode(teamMemberId));
        const resp = await dynamodb.getItem(req).promise();
        return teamMemberDynameh.responseUnwrapper.unwrapGetOutput(resp);
    }

    /**
     * Get all users on the given team.
     */
    export async function getAccountTeamMembers(accountUserId: string): Promise<DbTeamMember[]> {
        const req = teamMemberDynameh.requestBuilder.buildQueryInput(stripUserIdTestMode(accountUserId));
        teamMemberDynameh.requestBuilder.addFilter(req, {
            attribute: "invitation",
            operator: "attribute_not_exists"
        });
        let resp = await dynamodb.query(req).promise();
        const teamUsers: DbTeamMember[] = teamMemberDynameh.responseUnwrapper.unwrapQueryOutput(resp);

        // TODO this should be a utility in dynameh
        while (resp.LastEvaluatedKey) {
            req.ExclusiveStartKey = resp.LastEvaluatedKey;
            resp = await dynamodb.query(req).promise();
            teamUsers.push(...teamMemberDynameh.responseUnwrapper.unwrapQueryOutput(resp));
        }

        return teamUsers;
    }

    /**
     * Get invited users on the given team.
     */
    export async function getAccountInvitedTeamMembers(accountUserId: string): Promise<DbTeamMember[]> {
        const req = teamMemberDynameh.requestBuilder.buildQueryInput(stripUserIdTestMode(accountUserId));
        teamMemberDynameh.requestBuilder.addFilter(req, {
            attribute: "invitation",
            operator: "attribute_exists"
        });
        let resp = await dynamodb.query(req).promise();
        const teamUsers: DbTeamMember[] = teamMemberDynameh.responseUnwrapper.unwrapQueryOutput(resp);

        // TODO this should be a utility in dynameh
        while (resp.LastEvaluatedKey) {
            req.ExclusiveStartKey = resp.LastEvaluatedKey;
            resp = await dynamodb.query(req).promise();
            teamUsers.push(...teamMemberDynameh.responseUnwrapper.unwrapQueryOutput(resp));
        }

        return teamUsers;
    }

    /**
     * Get all teams for the given user.
     */
    export async function getUserTeamMemberships(teamMemberId: string): Promise<DbTeamMember[]> {
        const req = teamMemberByTeamMemberIdDynameh.requestBuilder.buildQueryInput(stripUserIdTestMode(teamMemberId));
        teamMemberDynameh.requestBuilder.addFilter(req, {
            attribute: "invitation",
            operator: "attribute_not_exists"
        });
        let resp = await dynamodb.query(req).promise();
        const teamUsers: DbTeamMember[] = teamMemberByTeamMemberIdDynameh.responseUnwrapper.unwrapQueryOutput(resp);

        // TODO this should be a utility in dynameh
        while (resp.LastEvaluatedKey) {
            req.ExclusiveStartKey = resp.LastEvaluatedKey;
            resp = await dynamodb.query(req).promise();
            teamUsers.push(...teamMemberByTeamMemberIdDynameh.responseUnwrapper.unwrapQueryOutput(resp));
        }

        return teamUsers;
    }

    /**
     * Get the team member the given user should login as.
     */
    export async function getUserLoginTeamMembership(user: DbUser): Promise<DbTeamMember> {
        if (user.defaultLoginUserId) {
            const teamMember = await DbTeamMember.get(user.defaultLoginUserId, user.userId);
            if (teamMember) {
                return teamMember;
            }
        }

        // Get any random TeamMember to log in as.
        const queryReq = teamMemberByTeamMemberIdDynameh.requestBuilder.buildQueryInput(user.userId);
        teamMemberDynameh.requestBuilder.addFilter(queryReq, {
            attribute: "invitation",
            operator: "attribute_not_exists"
        });
        queryReq.Limit = 1;
        const queryResp = await dynamodb.query(queryReq).promise();
        const teamMembers: DbTeamMember[] = teamMemberByTeamMemberIdDynameh.responseUnwrapper.unwrapQueryOutput(queryResp);
        if (teamMembers && teamMembers.length) {
            return teamMembers[0];
        }

        return null;
    }
}
