import {DbAccount} from "../db/DbAccount";

export interface Account {
    accountId: string;
    name: string;
}

export namespace Account {

    export function getFromDbAccount(account: DbAccount): Account {
        return {
            accountId: account.accountId,
            name: account.name
        };
    }
}
