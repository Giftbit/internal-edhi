import {DbAccount} from "../db/DbAccount";

export interface AccountSecurity {
    maxInactiveDays?: number;
    maxPasswordAge?: number;
    requireMfa: boolean;
    requirePasswordHistory: boolean;
}

export namespace AccountSecurity {

    export function getFromDbAccount(account: DbAccount): AccountSecurity {
        return {
            maxInactiveDays: account.maxInactiveDays || null,
            maxPasswordAge: account.maxPasswordAge || null,
            requireMfa: !!account.requireMfa,
            requirePasswordHistory: !!account.requirePasswordHistory
        };
    }
}
