import {DbAccountUser} from "../db/DbAccountUser";

/**
 * Details of an Account when shown to the User.
 */
export interface UserAccount {
    accountId: string;
    userId: string;
    accountDisplayName: string;
}

export namespace UserAccount {
    export function fromDbAccountUser(accountUser: DbAccountUser): UserAccount {
        return {
            accountId: accountUser.accountId,
            userId: accountUser.userId,
            accountDisplayName: accountUser.accountDisplayName
        };
    }
}
