import * as aws from "aws-sdk";
import * as dynameh from "dynameh";
import {assumeRole, getDynamehTableSchema, readLine} from "./scriptUtils";
import {DbApiKey} from "../src/db/DbApiKey";
import {DbDeletedApiKey} from "../src/db/DbDeletedApiKey";
import log = require("loglevel");

// Run: ./node_modules/.bin/ts-node scripts/deleteAccountApiKeys.ts

async function main(): Promise<void> {
    const creds = await assumeRole();
    const dynamodb = new aws.DynamoDB({
        apiVersion: "2012-08-10",
        credentials: new aws.Credentials({
            accessKeyId: creds.AccessKeyId,
            secretAccessKey: creds.SecretAccessKey,
            sessionToken: creds.SessionToken
        }),
        region: "us-west-2"
    });
    const tableSchema = await getDynamehTableSchema(dynamodb);
    const accountId = await readLine("accountId to delete API keys of");
    if (!accountId) {
        return;
    }

    log.debug("Looking for SQS queue...");
    const sqs = new aws.SQS({
        apiVersion: "2012-11-05",
        credentials: new aws.Credentials({
            accessKeyId: creds.AccessKeyId,
            secretAccessKey: creds.SecretAccessKey,
            sessionToken: creds.SessionToken
        }),
        region: "us-west-2"
    });
    const sqsQueues = await sqs.listQueues().promise();
    log.debug("SQS queues found", sqsQueues);
    const queueUrl = sqsQueues.QueueUrls.find(queueUrl => queueUrl.includes("Edhi-ApiKeyBlocklisterQueue"));
    if (!queueUrl) {
        throw new Error("Could not find SQS queue to notify of deleted API keys");
    }

    log.debug("Fetching ApiKeys...");
    const getKeysReq = dynameh.requestBuilder.buildQueryInput(tableSchema, "Account/" + accountId, "begins_with", "ApiKey/");
    const getTestKeysReq = dynameh.requestBuilder.buildQueryInput(tableSchema, "Account/" + accountId + "-TEST", "begins_with", "ApiKey/");
    const apiKeys = [
        ...await dynameh.queryHelper.queryAll(dynamodb, getKeysReq) as DbApiKey[],
        ...await dynameh.queryHelper.queryAll(dynamodb, getTestKeysReq) as DbApiKey[]
    ];
    log.info("Found", apiKeys.length, "API keys in account", accountId);
    if (apiKeys.length === 0) {
        return;
    }

    log.debug("Deleting API keys...");
    for (const apiKey of apiKeys) {
        const deleteReq = dynameh.requestBuilder.buildDeleteInput(tableSchema, DbApiKey.getKeys(apiKey));

        // Store a copy of the deleted API key for future reference.
        const deletedObject = DbDeletedApiKey.toDbObject(DbDeletedApiKey.fromDbApiKey(apiKey));
        const putDeletedReq = dynameh.requestBuilder.buildPutInput(tableSchema, deletedObject);

        const req = dynameh.requestBuilder.buildTransactWriteItemsInput(deleteReq, putDeletedReq);
        await dynamodb.transactWriteItems(req).promise();
        log.info("Deleted API key", apiKey.tokenId);
    }

    log.debug("Sending SQS message...");
    await sqs.sendMessage({
        QueueUrl: queueUrl,
        MessageBody: JSON.stringify({message: `deleted ${apiKeys.length} keys from account ${accountId}`})
    }).promise();
}

main().catch(log.error);
