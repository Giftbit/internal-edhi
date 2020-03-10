import * as dynameh from "dynameh";
import {DbUser} from "./DbUser";
import {DbObject} from "./DbObject";
import {dynamodb, objectDynameh} from "./dynamodb";

/**
 * Stores a history of passwords a user has had to prevent reuse.
 * This object is only created once the user has changed their password for the first time.
 * This object is stored separate from the rest of a User's data because it is large and
 * used infrequently (only on password change) making sending it over the wire every time
 * a user's info is requested rather wasteful.
 */
export interface DbUserPasswordHistory {

    userId: string;

    /**
     * History of recent passwords stored in a dictionary.
     */
    passwordHistory?: { [key: string]: DbUser.Password };

    createdDate: string;
}

export namespace DbUserPasswordHistory {

    /**
     * The maximum number of passwords to store in passwordHistory.
     */
    export const maxPasswordHistoryLength = 12;

    export function fromDbObject(o: DbObject): DbUserPasswordHistory {
        if (!o) {
            return null;
        }
        const userPasswordHistory = {...o};
        delete userPasswordHistory.pk;
        delete userPasswordHistory.sk;
        return userPasswordHistory as any;
    }

    export function toDbObject(user: DbUserPasswordHistory): DbUserPasswordHistory & DbObject {
        if (!user) {
            return null;
        }
        return {
            ...user,
            ...getKeys(user)
        };
    }

    export function getKeys(userPasswordHistory: DbUserPasswordHistory): DbObject {
        if (!userPasswordHistory || !userPasswordHistory.userId) {
            throw new Error("Not a valid DbUserPasswordHistory.");
        }
        return {
            pk: "User/" + userPasswordHistory.userId,
            sk: "UserPasswordHistory/" + userPasswordHistory.userId
        };
    }

    export async function get(userId: string): Promise<DbUserPasswordHistory> {
        return fromDbObject(await DbObject.get("User/" + userId, "UserPasswordHistory/" + userId));
    }

    export async function put(userPasswordHistory: DbUserPasswordHistory): Promise<void> {
        await DbObject.put(toDbObject(userPasswordHistory));
    }

    export async function update(userPasswordHistory: DbUserPasswordHistory, ...actions: dynameh.UpdateExpressionAction[]): Promise<void> {
        const req = objectDynameh.requestBuilder.buildUpdateInputFromActions(DbUserPasswordHistory.getKeys(userPasswordHistory), ...actions);
        objectDynameh.requestBuilder.addCondition(req, {
            attribute: "pk",
            operator: "attribute_exists"
        });
        await dynamodb.updateItem(req).promise();
    }
}
