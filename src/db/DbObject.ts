import {dynamodb, objectDynameh} from "./dynamodb";

export interface DbObject {
    pk: string;
    sk: string;
}

export namespace DbObject {

    export async function get(pk: string, sk: string): Promise<DbObject> {
        const req = objectDynameh.requestBuilder.buildGetInput(pk, sk);
        const resp = await dynamodb.getItem(req).promise();
        return objectDynameh.responseUnwrapper.unwrapGetOutput(resp);
    }

    export async function put(o: DbObject): Promise<void> {
        const req = objectDynameh.requestBuilder.buildPutInput(o);
        await dynamodb.putItem(req).promise();
    }
}
