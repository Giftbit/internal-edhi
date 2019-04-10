import * as dynameh from "dynameh";
import {DbObject} from "./DbObject";
import {stripUserIdTestMode} from "../utils/userUtils";
import {dynamodb, objectDynameh} from "./dynamodb";

export interface DbAccountDetails {

    userId: string;
    name: string;

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
        userId = stripUserIdTestMode(userId);
        return fromDbObject(await DbObject.get("Account/" + userId, "Account/" + userId));
    }

    export async function put(accountDetails: DbAccountDetails): Promise<void> {
        await DbObject.put(toDbObject(accountDetails));
    }

    export async function update(accountDetails: DbAccountDetails, ...actions: dynameh.UpdateExpressionAction[]): Promise<void> {
        const req = objectDynameh.requestBuilder.buildUpdateInputFromActions(getKeys(accountDetails), ...actions);
        objectDynameh.requestBuilder.addCondition(req, {
            attribute: "pk",
            operator: "attribute_exists"
        });
        await dynamodb.updateItem(req).promise();
    }
}
