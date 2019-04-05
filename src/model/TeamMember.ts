import {DbTeamMember} from "../db/DbTeamMember";

export interface TeamMember {

    userId: string;
    teamMemberId: string;
    displayName: string;

}

export namespace TeamMember {
    export function getUserDisplay(teamMember: DbTeamMember): TeamMember {
        return {
            userId: teamMember.userId,
            teamMemberId: teamMember.teamMemberId,
            displayName: teamMember.userDisplayName
        };
    }

    export function getAccountDisplay(teamMember: DbTeamMember): TeamMember {
        return {
            userId: teamMember.userId,
            teamMemberId: teamMember.teamMemberId,
            displayName: teamMember.accountDisplayName
        };
    }
}
