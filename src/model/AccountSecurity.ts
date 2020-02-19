import {DbAccount} from "../db/DbAccount";

export interface AccountSecurity {
    maxPasswordAge?: number;
    requireMfa: boolean;
    requirePasswordHistory: boolean;
}

export namespace AccountSecurity {

    export function getFromDbAccount(account: DbAccount): AccountSecurity {
        return {
            maxPasswordAge: account.maxPasswordAge || null,
            requireMfa: !!account.requireMfa,
            requirePasswordHistory: !!account.requirePasswordHistory
        };
    }
}
