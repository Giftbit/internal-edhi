import {DbAccountUser} from "../db/DbAccountUser";

/**
 * Details of an Account shown to the User.
 */
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
