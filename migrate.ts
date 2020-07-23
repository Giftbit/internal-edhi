import * as aws from "aws-sdk";
import * as dynameh from "dynameh";
import * as logPrefix from "loglevel-plugin-prefix";
import {DbUser} from "./src/db/DbUser";
import {DbObject} from "./src/db/DbObject";
import log = require("loglevel");
import readline = require("readline");

// Collect AWS credentials: aws sts assume-role --role-arn "arn:aws:iam::939876203001:role/InfrastructureAdmin" --role-session-name Migration --serial-number arn:aws:iam::939876203001:mfa/jeff.g --token-code 123456
// Run: ./node_modules/.bin/ts-node migrate.ts

async function main(): Promise<void> {
    const awsAccessKeyId = await readPassword("AWS access key ID: ");
    const awsSecretAccessKey = await readPassword("AWS secret access key: ");
    const awsSessionToken = await readPassword("AWS session token: ");

    const dynamodb = new aws.DynamoDB({
        apiVersion: "2012-08-10",
        credentials: new aws.Credentials({
            accessKeyId: awsAccessKeyId,
            secretAccessKey: awsSecretAccessKey,
            sessionToken: awsSessionToken
        }),
        region: "us-west-2"
    });

    log.info("Finding DynamoDB table...");
    const tableRes = await dynamodb.listTables().promise();
    const edhiObjectTable = tableRes.TableNames.find(name => name.indexOf("-Edhi-ObjectTable-") !== -1);
    if (!edhiObjectTable) {
        throw new Error("Could not find DynamoDB table");
    }

    const tableSchema: dynameh.TableSchema = {
        tableName: edhiObjectTable,
        partitionKeyField: "pk",
        partitionKeyType: "string",
        sortKeyField: "sk",
        sortKeyType: "string"
    };

    const scanReq = dynameh.requestBuilder.buildScanInput(tableSchema, {
        attribute: "pk",
        operator: "begins_with",
        values: ["User/"]
    });
    const scanRes: (DbUser & DbObject)[] = await dynameh.scanHelper.scanAll(dynamodb, scanReq);
    const badDbObjects = scanRes.filter(user => user.email !== user.email.toLowerCase());

    log.info("Migrating", badDbObjects.length, "to lower case");
    for (const badDbObject of badDbObjects) {
        const goodDbObject = DbUser.toDbObject(DbUser.fromDbObject(badDbObject));

        log.info("Migrating", badDbObject.pk, "to", goodDbObject.pk);
        if (goodDbObject.pk === badDbObject.pk || goodDbObject.sk === badDbObject.sk) {
            throw new Error("Switcheroo didn't fix pk or sk, what?")
        }

        const putReq = dynameh.requestBuilder.buildPutInput(tableSchema, goodDbObject);
        await dynamodb.putItem(putReq).promise();

        const deleteReq = dynameh.requestBuilder.buildDeleteInput(tableSchema, badDbObject);
        await dynamodb.deleteItem(deleteReq).promise();
    }

    log.info("Done!");
    process.exit();
}

function readPassword(prompt: string): Promise<string> {
    return new Promise<string>(resolve => {
        const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout
        });

        const keypressListener = function (c, k): void {
            // get the number of characters entered so far:
            const len = rl.line.length;
            // move cursor back to the beginning of the input:
            readline.moveCursor(process.stdout, -len, 0);
            // clear everything to the right of the cursor:
            readline.clearLine(process.stdout, 1);
            // replace the original input with asterisks:
            for (let i = 0; i < len; i++) {
                process.stdout.write("*");
            }
        };
        process.stdin.on("keypress", keypressListener);

        rl.question(prompt, res => {
            process.stdin.off("keypress", keypressListener);
            resolve(res);
            rl.close();
        });
    });
}

function readLine(prompt: string, defaultValue?: string): Promise<string> {
    return new Promise<string>(resolve => {
        const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout
        });
        rl.question(prompt, res => {
            resolve(res || defaultValue);
            rl.close();
        });
    });
}

const logColors = {
    "TRACE": "\u001b[0;32m",    // green
    "DEBUG": "\u001b[0;36m",    // cyan
    "INFO": "\u001b[0;34m",     // blue
    "WARN": "\u001b[0;33m",     // yellow
    "ERROR": "\u001b[0;31m"     // red
};

// Prefix log messages with the level.
logPrefix.reg(log);
logPrefix.apply(log, {
    format: (level, name, timestamp) => {
        return `[${logColors[level]}${level}\u001b[0m]`;
    },
});
log.setLevel(process.env["DEBUG"] ? log.levels.DEBUG : log.levels.INFO);

main().then(log.info).catch(log.error);
