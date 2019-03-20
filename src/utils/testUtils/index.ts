import {dynamodb, emailVerificationDynameh, orgDynameh, userDynameh} from "../../dynamodb";
import log = require("loglevel");
import uuid = require("uuid/v4");

export async function resetDb(): Promise<void> {
    log.debug("deleting existing tables");
    try {
        await dynamodb.deleteTable(emailVerificationDynameh.requestBuilder.buildDeleteTableInput()).promise();
        await dynamodb.deleteTable(orgDynameh.requestBuilder.buildDeleteTableInput()).promise();
        await dynamodb.deleteTable(userDynameh.requestBuilder.buildDeleteTableInput()).promise();
    } catch (err) {
        if (err.code !== "ResourceNotFoundException") {
            throw err;
        }
    }

    log.debug("creating tables");
    await dynamodb.createTable(emailVerificationDynameh.requestBuilder.buildCreateTableInput()).promise();
    await dynamodb.createTable(orgDynameh.requestBuilder.buildCreateTableInput()).promise();
    await dynamodb.createTable(userDynameh.requestBuilder.buildCreateTableInput()).promise();
}

export function generateId(length?: number): string {
    return (uuid() + uuid()).substring(0, length != null ? length : 20);
}
