import * as aws from "aws-sdk";
import * as dynameh from "dynameh";
import {DynamoKey, DynamoKeyPair, DynamoQueryConditionOperator} from "dynameh/dist/validation";
import {Condition, UpdateExpressionAction} from "dynameh";

export const dynamodb = new aws.DynamoDB({
    apiVersion: "2012-08-10",
    credentials: new aws.EnvironmentCredentials("AWS"),
    endpoint: process.env["TEST_ENV"] == "true" ? "http://localhost:8000" : undefined,
    region: process.env["AWS_REGION"]
});

export function dateCreatedNow(): string {
    return new Date().toISOString();
}

// This is an experiment that will be moved into the main lib if it works.
function scopeDynameh(tableSchema: dynameh.TableSchema) {
    return {
        requestBuilder: {
            buildRequestPutItem: (item: any) => dynameh.requestBuilder.buildRequestPutItem(tableSchema, item),
            buildGetInput: (partitionKeyValue: DynamoKey, sortKeyValue?: DynamoKey) => dynameh.requestBuilder.buildGetInput(tableSchema, partitionKeyValue, sortKeyValue),
            buildPutInput: (item: object) => dynameh.requestBuilder.buildPutInput(tableSchema, item),
            buildUpdateInputFromActions: (itemToUpdate: object, ...updateActions: UpdateExpressionAction[]) => dynameh.requestBuilder.buildUpdateInputFromActions(tableSchema, itemToUpdate, ...updateActions),
            buildDeleteInput: (itemToDelete: object) => dynameh.requestBuilder.buildDeleteInput(tableSchema, itemToDelete),
            buildDeleteTableInput: () => dynameh.requestBuilder.buildDeleteTableInput(tableSchema),
            buildQueryInput: (partitionKeyValue: DynamoKey, sortKeyOp?: DynamoQueryConditionOperator, ...sortKeyValues: DynamoKey[]) => dynameh.requestBuilder.buildQueryInput(tableSchema, partitionKeyValue, sortKeyOp, ...sortKeyValues),
            buildScanInput: (...filters: Condition[]) => dynameh.requestBuilder.buildScanInput(tableSchema, ...filters),
            buildBatchPutInput: (items: object[]) => dynameh.requestBuilder.buildBatchPutInput(tableSchema, items),
            buildBatchDeleteInput: (keyValues: DynamoKey[] | DynamoKeyPair[]) => dynameh.requestBuilder.buildBatchDeleteInput(tableSchema, keyValues),
            buildBatchGetInput: (keyValues: DynamoKey[] | DynamoKeyPair[]) => dynameh.requestBuilder.buildBatchGetInput(tableSchema, keyValues),
            buildCreateTableInput: (readCapacity: number = 1, writeCapacity: number = 1) => dynameh.requestBuilder.buildCreateTableInput(tableSchema, readCapacity, writeCapacity),
            buildUpdateTimeToLiveInput: () => dynameh.requestBuilder.buildUpdateTimeToLiveInput(tableSchema),
            addProjection: <T extends { ProjectionExpression?: aws.DynamoDB.ProjectionExpression, ExpressionAttributeNames?: aws.DynamoDB.ExpressionAttributeNameMap }>(projectableRequest: T, attributes: string[]) => dynameh.requestBuilder.addProjection(tableSchema, projectableRequest, attributes),
            addCondition: <T extends { ConditionExpression?: aws.DynamoDB.ConditionExpression, ExpressionAttributeNames?: aws.DynamoDB.ExpressionAttributeNameMap, ExpressionAttributeValues?: aws.DynamoDB.ExpressionAttributeValueMap }>(conditionableRequest: T, ...conditions: Condition[]) => dynameh.requestBuilder.addCondition(tableSchema, conditionableRequest, ...conditions),
            addFilter: <T extends { FilterExpression?: aws.DynamoDB.ConditionExpression, ExpressionAttributeNames?: aws.DynamoDB.ExpressionAttributeNameMap, ExpressionAttributeValues?: aws.DynamoDB.ExpressionAttributeValueMap }>(filterableRequest: T, ...filters: Condition[]) => dynameh.requestBuilder.addFilter(tableSchema, filterableRequest, ...filters)
        },
        responseUnwrapper: dynameh.responseUnwrapper,
        batchHelper: dynameh.batchHelper,
        concurrentHelper: dynameh.concurrentHelper
    }
}

// This is an experiment that will be moved into the main lib if it works.
export function buildTransactWriteItemsInput(...input: (aws.DynamoDB.PutItemInput | aws.DynamoDB.DeleteItemInput | aws.DynamoDB.UpdateItemInput)[]): aws.DynamoDB.TransactWriteItemsInput {
    return {
        TransactItems: input.map(i => {
            if ((i as aws.DynamoDB.PutItemInput).Item) {
                return {
                    Put: i as aws.DynamoDB.PutItemInput
                }
            }
            if ((i as aws.DynamoDB.DeleteItemInput).Key) {
                return {
                    Delete: i as aws.DynamoDB.DeleteItemInput
                }
            }
            if ((i as aws.DynamoDB.UpdateItemInput).UpdateExpression) {
                return {
                    Update: i as (aws.DynamoDB.UpdateItemInput & {UpdateExpression: string})
                }
            }
            throw new Error("Invalid input to buildTransactWriteItemsInput.  Each item must be a PutItemInput, DeleteItemInput or UpdateItemInput (with UpdateExpression set).");
        })
    };
}

const emailVerificationSchema: dynameh.TableSchema = {
    tableName: process.env["EMAIL_VERIFICATION_TABLE"],
    partitionKeyField: "token",
    partitionKeyType: "string",
    ttlField: "ttl"
};

const userSchema: dynameh.TableSchema = {
    tableName: process.env["USER_TABLE"],
    partitionKeyField: "email",
    partitionKeyType: "string"
    // TODO consider setting a versionKeyField
};

const organizationSchema: dynameh.TableSchema = {
    tableName: process.env["ORGANIZATION_TABLE"],
    partitionKeyField: "userId",
    partitionKeyType: "string"
    // TODO consider setting a versionKeyField
};

export const emailVerificationDynameh = scopeDynameh(emailVerificationSchema);
export const userDynameh = scopeDynameh(userSchema);
export const orgDynameh = scopeDynameh(organizationSchema);
