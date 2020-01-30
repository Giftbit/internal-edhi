import {DbAccount} from "../db/DbAccount";

export interface Account {
    userId: string;
    name: string;
}

export namespace Account {

    export function getFromDbAccount(account: DbAccount): Account {
        return {
            userId: account.accountId,
            name: account.name
        };
    }
}
