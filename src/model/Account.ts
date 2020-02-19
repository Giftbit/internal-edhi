import {DbAccount} from "../db/DbAccount";

export interface Account {
    id: string;
    name: string;
}

export namespace Account {

    export function getFromDbAccount(account: DbAccount): Account {
        return {
            id: account.accountId,
            name: account.name
        };
    }
}
