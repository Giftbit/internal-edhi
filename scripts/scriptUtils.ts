import * as aws from "aws-sdk";
import * as dynameh from "dynameh";
import log = require("loglevel");
import logPrefix = require("loglevel-plugin-prefix");
import readline = require("readline");

async function getCallerIdentity(): Promise<aws.STS.GetCallerIdentityResponse> {
    const sts = new aws.STS({apiVersion: "2011-06-15"});
    return await sts.getCallerIdentity().promise();
}

export async function assumeRole(): Promise<aws.STS.Credentials> {
    const roleName = await readLine("Role", "InfrastructureAdmin");
    const mfaCode = await readPassword("MFA");
    const callerIdentity = await getCallerIdentity();

    log.debug(`Assuming STS role ${roleName}...`);
    log.debug("callerIdentity=", callerIdentity);
    const sts = new aws.STS({apiVersion: "2011-06-15"});
    const res = await sts.assumeRole({
        RoleArn: `arn:aws:iam::${callerIdentity.Account}:role/${roleName}`,
        RoleSessionName: "EdhiScript",
        SerialNumber: callerIdentity.Arn.replace(":user/", ":mfa/"),
        TokenCode: mfaCode
    }).promise();
    return res.Credentials;
}

export async function getDynamehTableSchema(dynamodb: aws.DynamoDB): Promise<dynameh.TableSchema> {
    log.debug("Finding DynamoDB table...");
    const tableRes = await dynamodb.listTables().promise();
    const edhiObjectTable = tableRes.TableNames.find(name => name.indexOf("-Edhi-ObjectTable-") !== -1);
    if (!edhiObjectTable) {
        throw new Error("Could not find DynamoDB table");
    }

    return {
        tableName: edhiObjectTable,
        partitionKeyField: "pk",
        partitionKeyType: "string",
        sortKeyField: "sk",
        sortKeyType: "string"
    };
}

export function readPassword(prompt: string): Promise<string> {
    prompt += ": ";

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

export function readLine(prompt: string, defaultValue?: string): Promise<string> {
    if (defaultValue) {
        prompt += ` (${defaultValue})`;
    }
    prompt += ": ";

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
