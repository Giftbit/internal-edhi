import * as aws from "aws-sdk";
import {DbObject} from "./DbObject";
import {stripUserIdTestMode} from "../utils/userUtils";
import {dynamodb, objectDynameh} from "./dynamodb";

/**
 * Is stored in the database to guarantee that when users are created that they
 * have a unique userId.  DbUser is stored by email as the primary key and thus
 * can't guarantee uniqueness on the userId.
 */
export interface DbUserUniqueness {

    /**
     * The primary key.
     */
    userId: string;
}

export namespace DbUserUniqueness {

    export function fromDbObject(o: DbObject): DbUserUniqueness {
        if (!o) {
            return null;
        }
        const userDetails = {...o};
        delete userDetails.pk;
        delete userDetails.sk;
        return userDetails as any;
    }

    export function toDbObject(userUniqueness: DbUserUniqueness): DbUserUniqueness & DbObject {
        if (!userUniqueness) {
            return null;
        }
        return {
            ...userUniqueness,
            ...getKeys(userUniqueness)
        };
    }

    export function getKeys(userUniqueness: DbUserUniqueness): DbObject {
        if (!userUniqueness || !userUniqueness.userId) {
            throw new Error("Not a valid UserUniqueness.");
        }
        return {
            pk: "UserUniqueness/" + userUniqueness.userId,
            sk: "UserUniqueness/" + userUniqueness.userId
        };
    }

    export async function get(userId: string): Promise<DbUserUniqueness> {
        userId = stripUserIdTestMode(userId);
        return fromDbObject(await DbObject.get("UserUniqueness/" + userId, "UserUniqueness/" + userId));
    }

    export async function put(userUniqueness: DbUserUniqueness): Promise<void> {
        const req = buildPutInput(userUniqueness);
        await dynamodb.putItem(req).promise();
    }

    export function buildPutInput(userUniqueness: DbUserUniqueness): aws.DynamoDB.PutItemInput {
        const req = objectDynameh.requestBuilder.buildPutInput(toDbObject(userUniqueness));
        objectDynameh.requestBuilder.addCondition(req, {
            attribute: "pk",
            operator: "attribute_not_exists"
        });
        return req;
    }
}
