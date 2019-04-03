import {DbTeamMember} from "../../../db/DbTeamMember";

export interface Invitation {
    userId: string;
    teamMemberId: string;
    email: string;
    dateCreated: string;
    dateExpires: string;
}

export namespace Invitation {
    export function fromTeamMember(teamMember: DbTeamMember): Invitation {
        return {
            userId: teamMember.userId,
            teamMemberId: teamMember.teamMemberId,
            email: teamMember.invitation.email,
            dateCreated: teamMember.invitation.dateCreated,
            dateExpires: teamMember.invitation.dateExpires
        };
    }
}
