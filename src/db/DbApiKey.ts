import {DbObject} from "./DbObject";
import {dynamodb, objectDynameh, objectDynameh2} from "./dynamodb";
import {stripUserIdTestMode} from "../utils/userUtils";

export interface DbApiKey {

    userId: string;
    teamMemberId: string;
    name: string;

    tokenId: string;
    tokenVersion: number;
    roles: string[];
    scopes: string[];
    createdDate: string;

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

    export function toDbObject(apiKey: DbApiKey): DbObject {
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

    /**
     * Get the DB keys for the deleted API key.  This isn't publicly exposed
     * because we don't actually do anything with these yet.  We're just keeping
     * them around for future reference.
     */
    function getDeletedKeys(apiKey: DbApiKey): DbObject {
        if (!apiKey || !apiKey.userId || !apiKey.teamMemberId || !apiKey.tokenId) {
            throw new Error("Not a valid ApiKey.");
        }
        return {
            pk: "Account/" + apiKey.userId,
            sk: "DeletedApiKey/" + apiKey.tokenId,
            pk2: "User/" + apiKey.teamMemberId,
            sk2: "DeletedApiKey/" + apiKey.tokenId,
        }
    }

    export async function getByAccount(userId: string, tokenId: string): Promise<DbApiKey> {
        return fromDbObject(await DbObject.get("Account/" + stripUserIdTestMode(userId), "ApiKey/" + tokenId));
    }

    export async function getByUser(teamMemberId: string, tokenId: string): Promise<DbApiKey> {
        return fromDbObject(await DbObject.getSecondary("User/" + stripUserIdTestMode(teamMemberId), "ApiKey/" + tokenId));
    }

    export async function put(apiKey: DbApiKey): Promise<void> {
        await DbObject.put(toDbObject(apiKey));
    }

    export async function del(apiKey: DbApiKey): Promise<void> {
        const deleteReq = objectDynameh.requestBuilder.buildDeleteInput(toDbObject(apiKey));

        // Store a copy of the deleted API key for future reference.
        const deletedObject: DbObject = {
            ...apiKey,
            ...getDeletedKeys(apiKey)
        };
        const putDeletedReq = objectDynameh.requestBuilder.buildPutInput(deletedObject);

        const req = objectDynameh.requestBuilder.buildTransactWriteItemsInput(deleteReq, putDeletedReq);
        await dynamodb.transactWriteItems(req).promise();
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
