import * as aws from "aws-sdk";
import * as dynameh from "dynameh";
import {assumeRole, getDynamehTableSchema, readLine} from "./scriptUtils";
import {DbAccount} from "../src/db/DbAccount";
import log = require("loglevel");

// Run: ./node_modules/.bin/ts-node scripts/unfreezeAccount.ts

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
    const accountId = await readLine("accountId to unfreeze");
    if (!accountId) {
        return;
    }

    log.debug("Fetching Account...");
    const getAccountReq = dynameh.requestBuilder.buildGetInput(tableSchema, "Account/" + accountId, "Account/" + accountId);
    const getAccountResp = await dynamodb.getItem(getAccountReq).promise();
    const account = dynameh.responseUnwrapper.unwrapGetOutput(getAccountResp) as DbAccount;
    if (!account) {
        throw new Error(`Account with accountId ${accountId} not found.`);
    }
    if (account.accountId !== accountId) {
        throw new Error("It's a mad mad mad mad mad mad world.");
    }
    if (!account.frozen) {
        log.info("Account with accountId", accountId, "is not frozen");
    }

    log.debug("Updating Account...");
    const updateReq = dynameh.requestBuilder.buildUpdateInputFromActions(tableSchema, account, {
        attribute: "frozen",
        action: "remove"
    });
    await dynamodb.updateItem(updateReq).promise();
}

main().catch(log.error);
