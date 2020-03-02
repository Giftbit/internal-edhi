import {DbAccount} from "../db/DbAccount";

export interface Account {
    id: string;
    maxInactiveDays?: number;
    maxPasswordAge?: number;
    name: string;
    preventPasswordReuse: boolean;
    requireMfa: boolean;
}

export namespace Account {

    export function getFromDbAccount(account: DbAccount): Account {
        return {
            id: account.accountId,
            maxInactiveDays: account.maxInactiveDays || null,
            maxPasswordAge: account.maxPasswordAge || null,
            name: account.name,
            requireMfa: !!account.requireMfa,
            preventPasswordReuse: !!account.preventPasswordReuse
        };
    }
}
