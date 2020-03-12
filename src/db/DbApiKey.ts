import * as uuid from "uuid/v4";
import {DbObject} from "./DbObject";
import {dynamodb, objectDynameh} from "./dynamodb";
import {isTestModeUserId} from "../utils/userUtils";

/**
 * ApiKeys are unusual in Edhi: there are separate live and test mode versions.
 * For test mode both the accountId and userId must be in test mode.
 */
export interface DbApiKey {

    accountId: string;
    userId: string;
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
        delete apiKey.pk2;
        delete apiKey.sk2;
        return apiKey as any;
    }

    export function toDbObject(apiKey: DbApiKey): DbApiKey & DbObject {
        if (!apiKey) {
            return null;
        }
        return {
            ...apiKey,
            ...getKeys(apiKey)
        };
    }

    export function getKeys(apiKey: DbApiKey): DbObject {
        if (!apiKey || !apiKey.accountId || !apiKey.userId || !apiKey.tokenId) {
            throw new Error("Not a valid ApiKey.");
        }
        return {
            pk: "Account/" + apiKey.accountId,
            sk: "ApiKey/" + apiKey.tokenId,
            pk2: "User/" + apiKey.userId,
            sk2: "ApiKey/" + apiKey.tokenId,
        };
    }

    /**
     * Get the DB keys for the deleted API key.  This isn't publicly exposed
     * because we don't actually do anything with these yet.  We're just keeping
     * them around for future reference.
     */
    function getDeletedKeys(apiKey: DbApiKey): DbObject {
        if (!apiKey || !apiKey.accountId || !apiKey.userId || !apiKey.tokenId) {
            throw new Error("Not a valid ApiKey.");
        }
        return {
            pk: "Account/" + apiKey.accountId,
            sk: "DeletedApiKey/" + apiKey.tokenId,
            pk2: "User/" + apiKey.userId,
            sk2: "DeletedApiKey/" + apiKey.tokenId,
        };
    }

    export async function getByAccount(accountId: string, tokenId: string): Promise<DbApiKey> {
        return fromDbObject(await DbObject.get("Account/" + accountId, "ApiKey/" + tokenId));
    }

    export async function getByUser(userId: string, tokenId: string): Promise<DbApiKey> {
        return fromDbObject(await DbObject.getSecondary("User/" + userId, "ApiKey/" + tokenId));
    }

    export async function put(apiKey: DbApiKey): Promise<void> {
        if (isTestModeUserId(apiKey.accountId) !== isTestModeUserId(apiKey.userId)) {
            throw new Error(`accountId and userId must both be live or both be test mode accountId=${apiKey.accountId} userId=${apiKey.userId}`);
        }
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

    export async function getAllForAccount(accountId: string): Promise<DbApiKey[]> {
        const req = objectDynameh.requestBuilder.buildQueryInput("Account/" + accountId, "begins_with", "ApiKey/");
        const objects = await objectDynameh.queryHelper.queryAll(dynamodb, req);
        return objects.map(fromDbObject);
    }

    export async function getAllForAccountUser(accountId: string, userId: string): Promise<DbApiKey[]> {
        if (isTestModeUserId(accountId) !== isTestModeUserId(userId)) {
            throw new Error(`accountId and userId must both be live or both be test mode accountId=${accountId} userId=${userId}`);
        }

        const req = objectDynameh.requestBuilder.buildQueryInput("Account/" + accountId, "begins_with", "ApiKey/");
        objectDynameh.requestBuilder.addFilter(req, {
            attribute: "pk2",
            operator: "=",
            values: ["User/" + userId]
        });
        const objects = await objectDynameh.queryHelper.queryAll(dynamodb, req);
        return objects.map(fromDbObject);
    }

    export function generateTokenId(): string {
        return "tok-" + uuid().replace(/-/g, "");
    }
}
