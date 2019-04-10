import {DbTeamMember} from "../db/DbTeamMember";

export interface UserAccount {
    userId: string;
    teamMemberId: string;
    displayName: string;
}

export namespace UserAccount {
    export function fromDbTeamMember(teamMember: DbTeamMember): UserAccount {
        return {
            userId: teamMember.userId,
            teamMemberId: teamMember.teamMemberId,
            displayName: teamMember.accountDisplayName
        };
    }
}
