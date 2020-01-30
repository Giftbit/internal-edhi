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
            userId: teamMember.accountId,
            teamMemberId: teamMember.userId,
            displayName: teamMember.accountDisplayName,
            roles: teamMember.roles,
            scopes: teamMember.scopes
        };
    }
}
