import {DbObject} from "./DbObject";
import {dynamodb, objectDynameh, objectDynameh2} from "./dynamodb";
import {stripUserIdTestMode} from "../utils/userUtils";

export interface DbApiKey {

    userId: string;
    teamMemberId: string;
    displayName: string;

    tokenId: string;
    tokenVersion: number;
    roles: string[];
    scopes: string[];
    dateCreated: string;

}

export namespace DbApiKey {

    export function fromDbObject(o: DbObject): DbApiKey {
        if (!o) {
            return null;
        }
        const apiKey = {...o};
        delete apiKey.pk;
        delete apiKey.sk;
        return apiKey as any;
    }

    export function toDbObject(apiKey: DbApiKey) {
        if (!apiKey) {
            return null;
        }
        return {
            ...apiKey,
            ...getKeys(apiKey)
        };
    }

    export function getKeys(apiKey: DbApiKey): DbObject {
        if (!apiKey || !apiKey.userId || !apiKey.teamMemberId || !apiKey.tokenId) {
            throw new Error("Not a valid ApiKey.");
        }
        return {
            pk: "Account/" + apiKey.userId,
            sk: "ApiKey/" + apiKey.tokenId,
            pk2: "User/" + apiKey.teamMemberId,
            sk2: "ApiKey/" + apiKey.tokenId,
        }
    }

    export async function getByAccount(userId: string, tokenId: string): Promise<DbApiKey> {
        const req = objectDynameh.requestBuilder.buildGetInput("Account/" + stripUserIdTestMode(userId), "ApiKey/" + tokenId);
        const resp = await dynamodb.getItem(req).promise();
        return objectDynameh.responseUnwrapper.unwrapGetOutput(resp);
    }

    export async function getByUser(teamMemberId: string, tokenId: string): Promise<DbApiKey> {
        const req = objectDynameh2.requestBuilder.buildGetInput("User/" + stripUserIdTestMode(teamMemberId), "ApiKey/" + tokenId);
        const resp = await dynamodb.getItem(req).promise();
        return objectDynameh2.responseUnwrapper.unwrapGetOutput(resp);
    }

    export async function put(apiKey: DbApiKey): Promise<void> {
        const req = objectDynameh.requestBuilder.buildPutInput(toDbObject(apiKey));
        await dynamodb.putItem(req).promise();
    }

    export async function del(apiKey: DbApiKey): Promise<void> {
        const req = objectDynameh.requestBuilder.buildDeleteInput(toDbObject(apiKey));
        await dynamodb.deleteItem(req).promise();
    }

    export async function getAllForAccount(userId: string): Promise<DbApiKey[]> {
        const req = objectDynameh.requestBuilder.buildQueryInput("Account/" + stripUserIdTestMode(userId), "begins_with", "ApiKey/");
        const resp = await dynamodb.query(req).promise();
        const objects = objectDynameh.responseUnwrapper.unwrapQueryOutput(resp);
        return objects.map(fromDbObject);
    }

    export async function getAllForAccountUser(userId: string, teamMemberId: string): Promise<DbApiKey[]> {
        const req = objectDynameh.requestBuilder.buildQueryInput("Account/" + stripUserIdTestMode(userId), "begins_with", "ApiKey/");
        objectDynameh.requestBuilder.addFilter(req, {
            attribute: "pk2",
            operator: "=",
            values: ["User/" + stripUserIdTestMode(teamMemberId)]
        });
        const resp = await dynamodb.query(req).promise();
        const objects = objectDynameh.responseUnwrapper.unwrapQueryOutput(resp);
        return objects.map(fromDbObject);
    }

    export async function getAllForUser(userId: string): Promise<DbApiKey[]> {
        const req = objectDynameh2.requestBuilder.buildQueryInput("User/" + stripUserIdTestMode(userId), "begins_with", "ApiKey/");
        const resp = await dynamodb.query(req).promise();
        const objects = objectDynameh2.responseUnwrapper.unwrapQueryOutput(resp);
        return objects.map(fromDbObject);
    }
}
