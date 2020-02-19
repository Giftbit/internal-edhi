import {DbAccount} from "../db/DbAccount";

export interface AccountSecurity {
    requireMfa: boolean;
    requirePasswordHistory: boolean;
}

export namespace AccountSecurity {

    export function getFromDbAccount(account: DbAccount): AccountSecurity {
        return {
            requireMfa: !!account.requireMfa,
            requirePasswordHistory: !!account.requirePasswordHistory
        };
    }
}
