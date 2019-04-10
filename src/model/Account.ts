import {DbAccountDetails} from "../db/DbAccountDetails";

export interface Account {
    userId: string;
    name: string;
}

export namespace Account {

    export function getFromDbAccountDetails(account: DbAccountDetails): Account {
        return {
            userId: account.userId,
            name: account.name
        };
    }
}
