import {DbAccountUser} from "../db/DbAccountUser";

export interface AccountUser {
    accountId: string;
    userId: string;
    displayName: string;
    roles: string[];
    scopes: string[];
}

export namespace AccountUser {
    export function fromDbAccountUser(teamMember: DbAccountUser): AccountUser {
        return {
            accountId: teamMember.accountId,
            userId: teamMember.userId,
            displayName: teamMember.accountDisplayName,
            roles: teamMember.roles,
            scopes: teamMember.scopes
        };
    }
}
