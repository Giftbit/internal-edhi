import * as aws from "aws-sdk";
import * as dynameh from "dynameh";

export const dynamodb = new aws.DynamoDB({
    apiVersion: "2012-08-10",
    credentials: new aws.EnvironmentCredentials("AWS"),
    endpoint: process.env["TEST_ENV"] === "true" ? "http://localhost:8008" : undefined,
    region: process.env["AWS_REGION"]
});

export function createdDateNow(): string {
    return new Date().toISOString();
}

export function createdDatePast(years?: number, months?: number, days?: number): string {
    const date = new Date();
    date.setFullYear(date.getFullYear() - (years || 0), date.getMonth() - (months || 0), date.getDate() - (days || 0));
    return date.toISOString();
}

/**
 * Execute the TransactWriteItems request and get a response.
 * If an error is thrown it will include the CancellationReasons
 * object which is not available in the JS API currently.
 * @see https://github.com/aws/aws-sdk-js/issues/2464
 */
export async function transactWriteItemsFixed(req: aws.DynamoDB.TransactWriteItemsInput): Promise<aws.DynamoDB.TransactGetItemsOutput> {
    let txErrorResponse: { CancellationReasons: { Code: string }[] };
    try {
        const request = dynamodb.transactWriteItems(req);
        request.on("extractError", resp => {
            txErrorResponse = JSON.parse(resp.httpResponse.body.toString());
        });
        return await request.promise();
    } catch (error) {
        if (txErrorResponse && txErrorResponse.CancellationReasons) {
            error.CancellationReasons = txErrorResponse.CancellationReasons;
        }
        throw error;
    }
}

export const objectSchema: dynameh.TableSchema = {
    tableName: process.env["OBJECT_TABLE"],
    partitionKeyField: "pk",
    partitionKeyType: "string",
    sortKeyField: "sk",
    sortKeyType: "string"
};

export const objectSchema2: dynameh.TableSchema = {
    tableName: process.env["OBJECT_TABLE"],
    indexName: "EdhiIx2",
    indexProperties: {
        projectionType: "ALL",
        type: "GLOBAL"
    },
    partitionKeyField: "pk2",
    partitionKeyType: "string",
    sortKeyField: "sk2",
    sortKeyType: "string"
};

export const tokenActionSchema: dynameh.TableSchema = {
    tableName: process.env["TOKEN_ACTION_TABLE"],
    partitionKeyField: "token",
    partitionKeyType: "string",
    ttlField: "ttl"
};

export const objectDynameh = dynameh.scope(objectSchema);
export const objectDynameh2 = dynameh.scope(objectSchema2);
export const tokenActionDynameh = dynameh.scope(tokenActionSchema);
