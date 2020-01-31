import * as dynameh from "dynameh";
import * as giftbitRoutes from "giftbit-cassava-routes";
import {DbObject} from "./DbObject";
import {stripUserIdTestMode} from "../utils/userUtils";
import {dynamodb, objectDynameh} from "./dynamodb";

export interface DbAccount {

    accountId: string;
    
    name: string;

}

export namespace DbAccount {

    export function fromDbObject(o: DbObject): DbAccount {
        if (!o) {
            return null;
        }
        const accountDetails = {...o};
        delete accountDetails.pk;
        delete accountDetails.sk;
        return accountDetails as any;
    }

    export function toDbObject(accountDetails: DbAccount): DbAccount & DbObject {
        if (!accountDetails) {
            return null;
        }
        return {
            ...accountDetails,
            ...getKeys(accountDetails)
        };
    }

    export function getKeys(accountDetails: DbAccount): DbObject {
        return {
            pk: "Account/" + accountDetails.accountId,
            sk: "Account/" + accountDetails.accountId
        };
    }

    export async function get(accountId: string): Promise<DbAccount> {
        accountId = stripUserIdTestMode(accountId);
        return fromDbObject(await DbObject.get("Account/" + accountId, "Account/" + accountId));
    }

    export async function getByAuth(auth: giftbitRoutes.jwtauth.AuthorizationBadge): Promise<DbAccount> {
        auth.requireIds("userId");
        const account = await get(stripUserIdTestMode(auth.userId));
        if (!account) {
            throw new Error(`Could not find authed AccountDetails ${auth.userId}`);
        }
        return account;
    }

    export async function put(account: DbAccount): Promise<void> {
        await DbObject.put(toDbObject(account));
    }

    export async function update(account: DbAccount, ...actions: dynameh.UpdateExpressionAction[]): Promise<void> {
        const req = objectDynameh.requestBuilder.buildUpdateInputFromActions(getKeys(account), ...actions);
        objectDynameh.requestBuilder.addCondition(req, {
            attribute: "pk",
            operator: "attribute_exists"
        });
        await dynamodb.updateItem(req).promise();
    }
}
