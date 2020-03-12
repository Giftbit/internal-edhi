import {dynamodb, objectDynameh, objectDynameh2} from "./dynamodb";

export interface DbObject {
    pk: string;
    sk: string;
    pk2?: string;
    sk2?: string;
}

export namespace DbObject {

    export async function get(pk: string, sk: string): Promise<DbObject> {
        const req = objectDynameh.requestBuilder.buildGetInput(pk, sk);
        const resp = await dynamodb.getItem(req).promise();
        return objectDynameh.responseUnwrapper.unwrapGetOutput(resp);
    }

    export async function getSecondary(pk2: string, sk2: string): Promise<DbObject> {
        const req = objectDynameh2.requestBuilder.buildQueryInput(pk2, "=", sk2);
        const objs = await objectDynameh2.queryHelper.queryAll(dynamodb, req);
        if (objs.length) {
            return objs[0];
        }
        return null;
    }

    export async function getMany(keys: [string, string][]): Promise<DbObject[]> {
        const req = objectDynameh.requestBuilder.buildBatchGetInput(keys);
        return await objectDynameh.batchHelper.batchGetAll(dynamodb, req);
    }
}
