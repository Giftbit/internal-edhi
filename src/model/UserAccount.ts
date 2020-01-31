import {DbAccountUser} from "../db/DbAccountUser";

export interface UserAccount {
    accountId: string;
    userId: string;
    displayName: string;
}

export namespace UserAccount {
    export function fromDbAccountUser(accountUser: DbAccountUser): UserAccount {
        return {
            accountId: accountUser.accountId,
            userId: accountUser.userId,
            displayName: accountUser.accountDisplayName
        };
    }
}
