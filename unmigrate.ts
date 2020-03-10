import * as aws from "aws-sdk";
import * as dynemeh from "dynameh";
import * as logPrefix from "loglevel-plugin-prefix";
import log = require("loglevel");

/**
 * Nukes the entire ObjectTable to allow migration to be run again.
 */

const dynamodb = new aws.DynamoDB({
    apiVersion: "2012-08-10",
    credentials: new aws.SharedIniFileCredentials(),
    region: "us-west-2"
});

async function main(): Promise<void> {
    log.info("finding table name");
    const tableRes = await dynamodb.listTables().promise();
    const edhiObjectTable = tableRes.TableNames.find(name => name.indexOf("-Edhi-ObjectTable-") !== -1);
    if (!edhiObjectTable) {
        throw new Error("Could not find ")
    }
    log.info("got table name");

    const objectSchema: dynemeh.TableSchema = {
        tableName: edhiObjectTable,
        partitionKeyField: "pk",
        partitionKeyType: "string",
        sortKeyField: "sk",
        sortKeyType: "string"
    };

    const scanInput = dynemeh.requestBuilder.buildScanInput(objectSchema);
    let deleteCount = 0;
    await dynemeh.scanHelper.scanByCallback(dynamodb, scanInput, async items => {
        try {
            for (const item of items) {
                const delInput = dynemeh.requestBuilder.buildDeleteInput(objectSchema, item);
                await dynamodb.deleteItem(delInput).promise();
                log.info("deleted", ++deleteCount, "items");
            }
        } catch (err) {
            log.error(err);
            return false;
        }
        return true;
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

main().then(res => console.log("success", res)).catch(err => console.error("fail", err));
