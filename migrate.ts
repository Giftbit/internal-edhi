import * as aws from "aws-sdk";
import * as dynameh from "dynameh";
import * as logPrefix from "loglevel-plugin-prefix";
import {DbObject} from "./src/db/DbObject";
import {DbAccountUser} from "./src/db/DbAccountUser";
import log = require("loglevel");
import readline = require("readline");

// Collect AWS credentials: aws sts assume-role --role-arn "arn:aws:iam::`aws sts get-caller-identity --query Account --output text`:role/InfrastructureAdmin" --role-session-name Migration --serial-number arn:aws:iam::`aws sts get-caller-identity --query Account --output text`:mfa/jeff.g --token-code 167281
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
        values: ["Account/"]
    }, {
        attribute: "sk",
        operator: "begins_with",
        values: ["AccountUser/"]
    });
    const scanRes: (DbAccountUser & DbObject)[] = await dynameh.scanHelper.scanAll(dynamodb, scanReq);

    const accountUsersWithoutSelf = scanRes.filter(u => u.roles.indexOf("self") === -1)
    log.info("Updating", accountUsersWithoutSelf.length, "account users");

    for (const accountUser of accountUsersWithoutSelf) {
        const updateReq = dynameh.requestBuilder.buildUpdateInputFromActions(tableSchema, accountUser, {
            action: "list_append",
            attribute: "roles",
            values: ["self"]
        });
        log.info("Updating", accountUser.userId);
        await dynamodb.updateItem(updateReq).promise();
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

// eslint-disable-next-line @typescript-eslint/no-unused-vars
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
