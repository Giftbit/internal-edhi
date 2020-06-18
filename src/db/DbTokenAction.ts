import * as uuid from "uuid";
import {dynamodb, objectDynameh} from "./dynamodb";
import {DbObject} from "./DbObject";

/**
 * Allows actions based upon passing the token to the correct endpoint.
 * Eg: confirm email address, reset password.
 */
export interface DbTokenAction {
    token: string;
    action: DbTokenAction.Action;
    email: string;
    accountId?: string;
    userId?: string;
    ttl: Date | number;
}

export namespace DbTokenAction {
    export type Action = "emailVerification" | "resetPassword" | "acceptAccountInvitation" | "changeEmail";

    export interface GenerateAdditionalParams {
        email: string;
        accountId?: string;
        userId?: string;
    }

    export function fromDbObject(o: DbObject): DbTokenAction {
        if (!o) {
            return null;
        }
        const tokenAction = {...o};
        delete tokenAction.pk;
        delete tokenAction.sk;
        return tokenAction as any;
    }

    export function toDbObject(tokenAction: DbTokenAction): DbTokenAction & DbObject {
        if (!tokenAction) {
            return null;
        }
        return {
            ...tokenAction,
            ...getKeys(tokenAction)
        };
    }

    export function getKeys(tokenAction: DbTokenAction): DbObject {
        return {
            pk: "TokenAction/" + tokenAction.token,
            sk: "TokenAction/" + tokenAction.token
        };
    }

    export function generate(action: Action, durationInHours: number, params: GenerateAdditionalParams): DbTokenAction {
        return {
            token: uuid.v4().replace(/-/g, ""),
            action: action,
            ttl: new Date(Date.now() + durationInHours * 60 * 60 * 1000).valueOf(),
            ...params
        };
    }

    export async function get(token: string): Promise<DbTokenAction> {
        if (!token) {
            return null;
        }

        return fromDbObject(await DbObject.get("TokenAction/" + token, "TokenAction/" + token));
    }

    export async function put(tokenAction: DbTokenAction): Promise<void> {
        const req = objectDynameh.requestBuilder.buildPutInput(toDbObject(tokenAction));
        objectDynameh.requestBuilder.addCondition(req, {
            attribute: "pk",
            operator: "attribute_not_exists"
        });
        await dynamodb.putItem(req).promise();
    }

    export async function del(tokenAction: DbTokenAction): Promise<void> {
        const req = objectDynameh.requestBuilder.buildDeleteInput(getKeys(tokenAction));
        await dynamodb.deleteItem(req).promise();
    }
}
