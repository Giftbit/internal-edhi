import * as aws from "aws-sdk";
import * as dynameh from "dynameh";
import * as logPrefix from "loglevel-plugin-prefix";
import {DbAccount} from "./src/db/DbAccount";
import {DbUser} from "./src/db/DbUser";
import {DbAccountUser} from "./src/db/DbAccountUser";
import {DbApiKey} from "./src/db/DbApiKey";
import {DbUserUniqueness} from "./src/db/DbUserUniqueness";
import {encryptSecret, initializeEncryptionSecret} from "./src/utils/secretsUtils";
import log = require("loglevel");
import mysql = require("mysql2/promise");
import readline = require("readline");

// SSH tunnel should be established first.
// Add your ssh key: ssh-add /Volumes/credentials/ssh/AWSKey.pem
// Then the ssh tunnel:
//     dev:     ssh -L localhost:3307:lightrail-mysql.vpc:3306 jeff.g@52.42.17.208
//     staging: ssh -L localhost:3308:lightrail-mysql.vpc:3306 jeff.g@34.211.59.235
//     prod:    ssh -L localhost:3309:lightrail-mysql.vpc:3306 jeff.g@34.211.158.64
// If you can't connect at all check that your IP is allowed to connect to the bastion host.
// If you get "Permission denied" maybe restart the bastion host in the web console.
// Collect AWS credentials: aws sts assume-role --role-arn "arn:aws:iam::939876203001:role/InfrastructureAdmin" --role-session-name Migration --serial-number arn:aws:iam::939876203001:mfa/jeff.g --token-code 123456
// Run: ./node_modules/.bin/ts-node migrate.ts

async function main(): Promise<void> {
    const mysqlHost = "localhost";
    const mysqlPort = +await readLine("MySQL port (3307): ", "3307");
    const mysqlUser = "dev-160928";
    const mysqlPassword = await readPassword("MySQL database password: ");
    const encryptionSecret = await readPassword("Edhi encryption secret: ");
    const awsAccessKeyId = await readPassword("AWS access key ID: ");
    const awsSecretAccessKey = await readPassword("AWS secret access key: ");
    const awsSessionToken = await readPassword("AWS session token: ");

    if (!/^[0-9A-Fa-f]{64}$/.test(encryptionSecret)) {
        throw new Error("Encryption secret must be 64 hex characters.");
    }
    initializeEncryptionSecret(Promise.resolve(encryptionSecret));

    if ((await readLine(`Migrating from ${mysqlUser}@${mysqlHost}:${mysqlPort}, continue? (y/n) `)) !== "y") {
        log.info("Exiting...");
        process.exit();
    }

    const mysqlConnection = await mysql.createConnection({
        host: mysqlHost,
        port: mysqlPort,
        user: mysqlUser,
        password: mysqlPassword,
        database: "giftbit_currency_schema"
    });

    // account_expired doesn't seem like it was ever set in services
    // account_locked is when when users verify their email address
    // enabled is unset to delete members from a team (which made them impossible to reinvite so we're intentionally forgetting about them)
    log.info("Fetching users...");
    const userRows: {
        giftbit_user_id: string;
        username: string;
        team_member_id: string;
        password: string;
        account_locked: Buffer;
        two_factor_authentication_device: string;
        date_created: Date;
    }[] = (await mysqlConnection.execute("select giftbit_user_id, username, team_member_id, password, account_locked, two_factor_authentication_device, date_created from giftbit_user where account_expired = 0 and enabled = 1"))[0];
    log.debug("userRows=", userRows);

    log.info("Calculating DbAccounts...");
    const dbAccounts: DbAccount[] = userRows
        .filter(row => row.giftbit_user_id === row.team_member_id && !row.account_locked.readUInt8(0))
        .map(row => {
            const account: DbAccount = {
                accountId: row.giftbit_user_id,
                name: !row.username.match(/(giftbit.com|lightrail.com|uvic.ca|gmail.com)$/) ? row.username.replace(/(.*@)?(.*)/, "$2") : row.username,
                createdDate: row.date_created.toISOString()
            };
            return account;
        });
    const dbAccountMap = getMap(dbAccounts, "accountId");
    log.debug("dbAccounts=", dbAccounts);

    log.info("Calculating DbUserUniquenesses...");
    const dbUserUniquenesses: DbUserUniqueness[] = userRows
        .map(row => {
            const user: DbUserUniqueness = {
                userId: row.team_member_id
            };
            return user;
        });
    const dbUserUniquenessesMap = getMap(dbUserUniquenesses, "userId");
    log.debug("dbUserUniquenesses=", dbUserUniquenesses);

    log.info("Fetching roles...");
    const rolesRows: {
        giftbit_user_id: string;
        team_member_id: string;
        roleString: string;
    }[] = (await mysqlConnection.execute("select giftbit_user_id, team_member_id, GROUP_CONCAT(role SEPARATOR ', ') as roleString from granted_role group by team_member_id"))[0];
    const rolesMap = getMap(rolesRows, "team_member_id");

    log.info("Fetching scopes...");
    const scopesRows: {
        giftbit_user_id: string;
        team_member_id: string;
        scopeString: string;
    }[] = (await mysqlConnection.execute("select giftbit_user_id, team_member_id, GROUP_CONCAT(scope SEPARATOR ', ') as scopeString from granted_scope group by team_member_id"))[0];
    const scopesMap = getMap(scopesRows, "team_member_id");

    log.info("Calculating DbAccountUsers...");
    const dbAccountUsers = userRows
        .map(row => {
            const account = dbAccountMap[row.giftbit_user_id];
            if (!account) {
                log.warn(`Can't find Account ${row.giftbit_user_id} for User ${row.team_member_id}.  Account may be expired, locked or disabled.`);
                return null;
            }

            if (!dbUserUniquenessesMap[row.team_member_id]) {
                throw new Error(`Can't find DbUserUniqueness ${row.team_member_id}`);
            }

            const roles = rolesMap[row.team_member_id]?.roleString ?? "";
            const scopes = scopesMap[row.team_member_id]?.scopeString ?? "";

            const accountUser: DbAccountUser = {
                accountId: row.giftbit_user_id,
                userId: row.team_member_id,
                userDisplayName: row.username,
                accountDisplayName: account.name,
                roles: roles.split(",").map(r => r.trim()).filter(r => !!r),
                scopes: scopes.split(",").map(s => s.trim()).filter(s => !!s),
                createdDate: row.date_created.toISOString()
            };
            return accountUser;
        })
        .filter(a => !!a);
    log.debug("dbAccountUsers=", dbAccountUsers);

    log.info("Fetching backup codes...");
    const backupCodesRows: {
        team_member_id: string;
        code: string;
        date_created: Date;
    }[] = (await mysqlConnection.execute("select team_member_id, code, date_created from two_factor_authentication_backup_code where active = 1"))[0];
    const backupCodesMap = getMapOfLists(backupCodesRows, "team_member_id");

    log.info("Calculating DbUsers...");
    const dbUsers = await Promise.all(userRows
        .map(async row => {
            const email = row.username;
            if (email.indexOf("@") === -1) {
                throw new Error(`User ${row.team_member_id} username ${email} was expected to be an email address.`);
            }

            let backupCodes: { [code: string]: DbUser.BackupCode } | undefined = undefined;
            if (backupCodesMap[row.team_member_id]) {
                backupCodes = {};
                for (const codeRow of backupCodesMap[row.team_member_id]) {
                    backupCodes[await encryptSecret(codeRow.code)] = {
                        createdDate: codeRow.date_created.toISOString()
                    };
                }
            }

            const user: DbUser = {
                email: email,
                userId: row.team_member_id,
                login: {
                    password: {
                        algorithm: "BCRYPT",
                        hash: row.password,
                        createdDate: row.date_created.toISOString()
                    },
                    emailVerified: !row.account_locked.readUInt8(0),
                    frozen: false,
                    mfa: row.two_factor_authentication_device ? {
                        smsDevice: row.two_factor_authentication_device,
                        backupCodes: backupCodes,

                        // Trusted devices cannot be migrated from v1.  In v1 the trusted device code was a
                        // hash of user identifiers and the same for all devices.  Its expiration was left
                        // entirely to the cookie expiration.  v2 generates unique codes for each device.
                        trustedDevices: {}
                    } : undefined,
                    defaultLoginAccountId: row.giftbit_user_id,
                },
                limitedActions: {},
                createdDate: row.date_created.toISOString()
            };

            return user;
        }));
    log.debug("dbUsers=", dbUsers);

    log.info("Fetching api keys...");
    const apiKeyRows: {
        giftbit_user_id: string;
        team_member_id: string;
        name: string;
        token_id: string;
        token_version: number;
        token_body_json: string;
        date_created: Date;
    }[] = (await mysqlConnection.execute("select giftbit_user_id, team_member_id, name, token_id, token_version, token_body_json, date_created from stored_json_web_token where soft_deleted_date is null"))[0];
    log.debug("apiKeyRows=", apiKeyRows);

    log.info("Calculating DbApiKeys...");
    const dbApiKeys = apiKeyRows.map(row => {
        const apiKeyBody = JSON.parse(row.token_body_json);
        const dbApiKey: DbApiKey = {
            accountId: row.giftbit_user_id,
            userId: row.team_member_id,
            name: row.name,
            tokenId: row.token_id,
            tokenVersion: row.token_version,
            roles: apiKeyBody.roles,
            scopes: apiKeyBody.scopes,
            createdDate: row.date_created.toISOString()
        };
        return dbApiKey;
    });
    log.debug("dbApiKeys=", dbApiKeys);

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

    const putItems = [
        ...dbAccounts.map(DbAccount.toDbObject),
        ...dbUserUniquenesses.map(DbUserUniqueness.toDbObject),
        ...dbAccountUsers.map(DbAccountUser.toDbObject),
        ...dbUsers.map(DbUser.toDbObject),
        ...dbApiKeys.map(DbApiKey.toDbObject)
    ];
    const batchWriteItemInput = dynameh.requestBuilder.buildBatchPutInput(tableSchema, putItems);

    if ((await readLine(`Migrating ${putItems.length} items to ${edhiObjectTable}, continue? (y/n) `)) !== "y") {
        log.info("Exiting...");
        process.exit();
    }
    await dynameh.batchHelper.batchWriteAll(dynamodb, batchWriteItemInput);

    log.info("Done!");
    await mysqlConnection.close();
    process.exit();
}

function getMap<T, K extends keyof T>(objs: T[], idField: K): { [id: string]: T } {
    const objMap: { [id: string]: T } = {};
    for (const obj of objs) {
        const ix: string = obj[idField] as any as string;   // Not sure how to constain T[K] to string.
        objMap[ix] = obj;
    }
    return objMap;
}

function getMapOfLists<T, K extends keyof T>(objs: T[], idField: K): { [id: string]: T[] } {
    const objMap: { [id: string]: T[] } = {};
    for (const obj of objs) {
        const ix: string = obj[idField] as any as string;   // Not sure how to constain T[K] to string.
        if (objMap[ix]) {
            objMap[ix].push(obj);
        } else {
            objMap[ix] = [obj];
        }
    }
    return objMap;
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
