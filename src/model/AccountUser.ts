import {DbAccountUser} from "../db/DbAccountUser";
import {DbAccount} from "../db/DbAccount";

/**
 * Details of a User in the context of an Account.
 */
export interface AccountUser {
    accountId: string;
    userId: string;
    userDisplayName: string;
    lockedByInactivity: boolean;
    roles: string[];
    scopes: string[];
}

export namespace AccountUser {
    export function fromDbAccountUser(account: DbAccount, accountUser: DbAccountUser): AccountUser {
        return {
            accountId: accountUser.accountId,
            userId: accountUser.userId,
            userDisplayName: accountUser.userDisplayName,
            lockedByInactivity: DbAccountUser.isLockedByInactivity(accountUser, account),
            roles: accountUser.roles,
            scopes: accountUser.scopes
        };
    }
}
