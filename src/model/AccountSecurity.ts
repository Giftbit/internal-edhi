import {DbAccount} from "../db/DbAccount";

export interface AccountSecurity {
    requireMfa: boolean;
}

export namespace AccountSecurity {

    export function getFromDbAccount(account: DbAccount): AccountSecurity {
        return {
            requireMfa: !!account.requireMfa
        };
    }
}
