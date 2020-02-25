import {DbAccountUser} from "../db/DbAccountUser";

export interface Invitation {
    accountId: string;
    userId: string;
    email: string;
    createdDate: string;
    expiresDate: string;
}

export namespace Invitation {
    export function fromDbAccountUser(teamMember: DbAccountUser): Invitation {
        if (!teamMember.pendingInvitation) {
            throw new Error("TeamMember does not have an invitation.");
        }
        return {
            accountId: teamMember.accountId,
            userId: teamMember.userId,
            email: teamMember.pendingInvitation.email,
            createdDate: teamMember.pendingInvitation.createdDate,
            expiresDate: teamMember.pendingInvitation.expiresDate
        };
    }
}
