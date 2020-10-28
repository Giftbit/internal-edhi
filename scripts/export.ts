import * as aws from "aws-sdk";
import * as dynameh from "dynameh";
import {assumeRole, getDynamehTableSchema, readLine} from "./scriptUtils";
import fs = require("fs");
import log = require("loglevel");

// Run: ./node_modules/.bin/ts-node scripts/export.ts

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
    const outputFileName = await readLine("Output file name", "edhi.json");

    // This downloads the entire database and holds it all in memory before writing it.
    // That would be a bad idea if the database was large.  Fortunately we know it's only
    // in the low 10s of megabytes.

    log.info("Downloading Edhi table...");
    const scanReq = dynameh.requestBuilder.buildScanInput(tableSchema);
    const scanRes = await dynameh.scanHelper.scanAll(dynamodb, scanReq);

    log.info(`Writing file ${outputFileName}...`);
    fs.writeFileSync(outputFileName, JSON.stringify(scanRes));

    log.info("Done.");
}

main().then(log.info).catch(log.error);
