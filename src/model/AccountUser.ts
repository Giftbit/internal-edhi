import {DbTeamMember} from "../db/DbTeamMember";

export interface AccountUser {
    userId: string;
    teamMemberId: string;
    displayName: string;
    roles: string[];
    scopes: string[];
}

export namespace AccountUser {
    export function fromDbTeamMember(teamMember: DbTeamMember): AccountUser {
        return {
            userId: teamMember.userId,
            teamMemberId: teamMember.teamMemberId,
            displayName: teamMember.accountDisplayName,
            roles: teamMember.roles,
            scopes: teamMember.scopes
        };
    }
}
