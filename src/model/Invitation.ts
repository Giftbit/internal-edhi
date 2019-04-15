import {DbTeamMember} from "../db/DbTeamMember";

export interface Invitation {
    userId: string;
    teamMemberId: string;
    email: string;
    createdDate: string;
    dateExpires: string;
}

export namespace Invitation {
    export function fromDbTeamMember(teamMember: DbTeamMember): Invitation {
        if (!teamMember.invitation) {
            throw new Error("TeamMember does not have an invitation.");
        }
        return {
            userId: teamMember.userId,
            teamMemberId: teamMember.teamMemberId,
            email: teamMember.invitation.email,
            createdDate: teamMember.invitation.createdDate,
            dateExpires: teamMember.invitation.dateExpires
        };
    }
}
