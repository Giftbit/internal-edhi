import {DbObject} from "./DbObject";

export interface DbAccountDetails {

    userId: string;
    displayName: string;

}

export namespace DbAccountDetails {

    export function fromDbObject(o: DbObject): DbAccountDetails {
        if (!o) {
            return null;
        }
        const accountDetails = {...o};
        delete accountDetails.pk;
        delete accountDetails.sk;
        return accountDetails as any;
    }

    export function toDbObject(accountDetails: DbAccountDetails) {
        if (!accountDetails) {
            return null;
        }
        return {
            ...accountDetails,
            ...getKeys(accountDetails)
        };
    }

    export function getKeys(accountDetails: DbAccountDetails): DbObject {
        return {
            pk: "Account/" + accountDetails.userId,
            sk: "Account/" + accountDetails.userId
        }
    }

    export async function get(userId: string): Promise<DbAccountDetails> {
        return fromDbObject(await DbObject.get("Account/" + userId, "Account/" + userId));
    }
}
