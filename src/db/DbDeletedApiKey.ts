import {DbObject} from "./DbObject";
import {DbApiKey} from "./DbApiKey";
import {createdDateNow, dynamodb, objectDynameh} from "./dynamodb";

export interface DbDeletedApiKey extends DbApiKey {
    deletedDate: string;
}

export namespace DbDeletedApiKey {

    export function fromDbObject(o: DbObject): DbDeletedApiKey {
        if (!o) {
            return null;
        }
        const deletedApiKey = {...o};
        delete deletedApiKey.pk;
        delete deletedApiKey.sk;
        delete deletedApiKey.pk2;
        delete deletedApiKey.sk2;
        return deletedApiKey as any;
    }

    export function toDbObject(deletedApiKey: DbDeletedApiKey): DbDeletedApiKey & DbObject {
        if (!deletedApiKey) {
            return null;
        }
        return {
            ...deletedApiKey,
            ...getKeys(deletedApiKey)
        };
    }

    export function getKeys(apiKey: DbDeletedApiKey): DbObject {
        if (!apiKey || !apiKey.accountId || !apiKey.userId || !apiKey.tokenId || !apiKey.deletedDate) {
            throw new Error("Not a valid DbDeletedApiKey.");
        }

        return {
            // Putting all the deleted API keys in the same partition makes it queryable.
            // As best I understand DynamoDB this partition might grow large as the number of
            // deleted keys grows but because it won't be accessed often it won't become a
            // hot partition and that's ok.
            pk: "DeletedApiKey/",
            sk: "DeletedApiKey/" + apiKey.tokenId
        };
    }

    export function fromDbApiKey(apiKey: DbApiKey): DbDeletedApiKey {
        return {
            ...apiKey,
            deletedDate: createdDateNow()
        };
    }

    export async function getAll(): Promise<DbDeletedApiKey[]> {
        const req = objectDynameh.requestBuilder.buildQueryInput("DeletedApiKey/");
        req.ConsistentRead = true;
        const objects = await objectDynameh.queryHelper.queryAll(dynamodb, req);
        return objects.map(fromDbObject);
    }
}
