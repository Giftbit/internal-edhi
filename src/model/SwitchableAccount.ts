import {DbAccountUser} from "../db/DbAccountUser";

/**
 * Details of an Account the user can switch to.
 */
export interface SwitchableAccount {
    accountId: string;
    displayName: string;
    isCurrentAccount: boolean;
}

export namespace SwitchableAccount {
    export function fromDbAccountUser(accountUser: DbAccountUser, isCurrentAccount: boolean): SwitchableAccount {
        return {
            accountId: accountUser.accountId,
            displayName: accountUser.accountDisplayName,
            isCurrentAccount: isCurrentAccount
        };
    }
}
