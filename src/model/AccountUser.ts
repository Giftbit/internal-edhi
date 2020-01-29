import {DbAccountUser} from "../db/DbAccountUser";

export interface AccountUser {
    userId: string;
    teamMemberId: string;
    displayName: string;
    roles: string[];
    scopes: string[];
}

export namespace AccountUser {
    export function fromDbAccountUser(teamMember: DbAccountUser): AccountUser {
        return {
            userId: teamMember.userId,
            teamMemberId: teamMember.teamMemberId,
            displayName: teamMember.accountDisplayName,
            roles: teamMember.roles,
            scopes: teamMember.scopes
        };
    }
}
