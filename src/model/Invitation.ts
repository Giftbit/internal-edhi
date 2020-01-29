import {DbAccountUser} from "../db/DbAccountUser";

export interface Invitation {
    userId: string;
    teamMemberId: string;
    email: string;
    createdDate: string;
    expiresDate: string;
}

export namespace Invitation {
    export function fromDbAccountUser(teamMember: DbAccountUser): Invitation {
        if (!teamMember.invitation) {
            throw new Error("TeamMember does not have an invitation.");
        }
        return {
            userId: teamMember.userId,
            teamMemberId: teamMember.teamMemberId,
            email: teamMember.invitation.email,
            createdDate: teamMember.invitation.createdDate,
            expiresDate: teamMember.invitation.expiresDate
        };
    }
}
