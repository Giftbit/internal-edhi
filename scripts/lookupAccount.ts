import * as aws from "aws-sdk";
import * as dynameh from "dynameh";
import {assumeRole, getDynamehTableSchema, readLine} from "./scriptUtils";
import {DbAccount} from "../src/db/DbAccount";
import {DbAccountUser} from "../src/db/DbAccountUser";
import {DbApiKey} from "../src/db/DbApiKey";
import log = require("loglevel");

// Run: ./node_modules/.bin/ts-node scripts/lookupAccount.ts

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
    const accountId = await readLine("accountId");
    if (!accountId) {
        return;
    }

    log.debug("Querying Account...");
    const getAccountReq = dynameh.requestBuilder.buildQueryInput(tableSchema, `Account/${accountId}`);
    const getAccountRes = await dynameh.queryHelper.queryAll(dynamodb, getAccountReq) as (DbAccount | DbAccountUser | DbApiKey)[];
    log.debug("getAccountRes=", getAccountRes);
    if (getAccountRes.length === 0) {
        log.info("Nothing found for accountId", accountId);
        return;
    }

    const account = getAccountRes.find(a => !(a as any).roles && !(a as any).scopes) as DbAccount;
    if (!account) {
        throw new Error("Found some Account data but did not find Account object.");
    }

    log.info("Account accountId=", account.accountId, "name=", account.name, "frozen=", account.frozen, "createdDate=", account.createdDate);

    const accountUsers = getAccountRes.filter(a => (a as DbAccountUser).userDisplayName && (a as DbAccountUser).accountDisplayName) as DbAccountUser[];
    for (const accountUser of accountUsers) {
        log.info("AccountUser userDisplayName=", accountUser.userDisplayName, "createdDate=", accountUser.createdDate, "pendingInvitation=", !!accountUser.pendingInvitation);
    }

    const apiKeys = getAccountRes.filter(a => (a as DbApiKey).tokenId) as DbApiKey[];
    log.info("Live mode API key count=", apiKeys.length);
}

main().catch(log.error);
