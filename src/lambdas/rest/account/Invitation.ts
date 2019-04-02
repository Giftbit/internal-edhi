import {TeamMember} from "../../../model/TeamMember";

export interface Invitation {
    userId: string;
    teamMemberId: string;
    email: string;
    dateCreated: string;
    dateExpires: string;
}

export namespace Invitation {
    export function fromTeamMember(teamMember: TeamMember): Invitation {
        return {
            userId: teamMember.userId,
            teamMemberId: teamMember.teamMemberId,
            email: teamMember.invitation.email,
            dateCreated: teamMember.invitation.dateCreated,
            dateExpires: teamMember.invitation.dateExpires
        };
    }
}
