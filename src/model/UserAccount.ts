import {DbAccountUser} from "../db/DbAccountUser";

export interface UserAccount {
    userId: string;
    teamMemberId: string;
    displayName: string;
}

export namespace UserAccount {
    export function fromDbAccountUser(teamMember: DbAccountUser): UserAccount {
        return {
            userId: teamMember.userId,
            teamMemberId: teamMember.teamMemberId,
            displayName: teamMember.accountDisplayName
        };
    }
}
