import {DbAccountUser} from "../db/DbAccountUser";

export interface Invitation {
    accountId: string;
    userId: string;
    email: string;
    createdDate: string;
    expiresDate: string;
}

export namespace Invitation {
    export function fromDbAccountUser(accountUser: DbAccountUser): Invitation {
        if (!accountUser.pendingInvitation) {
            throw new Error("AccountUser does not have an invitation.");
        }
        return {
            accountId: accountUser.accountId,
            userId: accountUser.userId,
            email: accountUser.pendingInvitation.email,
            createdDate: accountUser.pendingInvitation.createdDate,
            expiresDate: accountUser.pendingInvitation.expiresDate
        };
    }
}
