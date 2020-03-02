import {DbAccountUser} from "../db/DbAccountUser";
import {DbAccount} from "../db/DbAccount";
import {createdDatePast} from "../db/dynamodb";

/**
 * Details of a User in the context of an Account.
 */
export interface AccountUser {
    accountId: string;
    userId: string;
    userDisplayName: string;
    lockedOnInactivity: boolean;
    roles: string[];
    scopes: string[];
}

export namespace AccountUser {
    export function fromDbAccountUser(account: DbAccount, accountUser: DbAccountUser): AccountUser {
        return {
            accountId: accountUser.accountId,
            userId: accountUser.userId,
            userDisplayName: accountUser.userDisplayName,
            lockedOnInactivity: !!account.maxInactiveDays && !!accountUser.lastLoginDate && accountUser.lastLoginDate < createdDatePast(0, 0, account.maxInactiveDays),
            roles: accountUser.roles,
            scopes: accountUser.scopes
        };
    }
}
