import * as aws from "aws-sdk";
import * as dynameh from "dynameh";
import {assumeRole, getDynamehTableSchema, readLine} from "./scriptUtils";
import {DbAccount} from "../src/db/DbAccount";
import {DbAccountUser} from "../src/db/DbAccountUser";
import log = require("loglevel");

// Run: ./node_modules/.bin/ts-node scripts/findAccountId.ts

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
    const searchString = await readLine("String string (case sensitive)");
    if (!searchString) {
        return;
    }

    log.debug("Searching DbAccounts...");
    const accountScanReq = dynameh.requestBuilder.buildScanInput(
        tableSchema,
        {
            attribute: "pk",
            operator: "begins_with",
            values: ["Account/"]
        },
        {
            attribute: "sk",
            operator: "begins_with",
            values: ["Account/"]
        },
        {
            attribute: "name",
            operator: "contains",
            values: [searchString]
        }
    );
    const accountScanRes = await dynameh.scanHelper.scanAll(dynamodb, accountScanReq) as DbAccount[];
    for (const account of accountScanRes) {
        log.info(`Found Account name=${account.name} accountId=${account.accountId}`);
    }

    log.debug("Searching DbAccountUsers...");
    const accountUserScanReq = dynameh.requestBuilder.buildScanInput(
        tableSchema,
        {
            attribute: "pk",
            operator: "begins_with",
            values: ["Account/"]
        },
        {
            attribute: "sk",
            operator: "begins_with",
            values: ["AccountUser/"]
        },
        {
            attribute: "userDisplayName",
            operator: "contains",
            values: [searchString]
        }
    );
    const accounUsertScanRes = await dynameh.scanHelper.scanAll(dynamodb, accountUserScanReq) as DbAccountUser[];
    for (const accountUser of accounUsertScanRes) {
        log.info(`Found AccountUser email=${accountUser.userDisplayName} accountId=${accountUser.accountId}`);
    }
}

main().catch(log.error);
