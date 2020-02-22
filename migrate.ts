import {DbAccount} from "./src/db/DbAccount";
import {DbUser} from "./src/db/DbUser";
import {DbAccountUser} from "./src/db/DbAccountUser";

const mysql = require('mysql2/promise');

// SSH tunnel should be established first.
// dev:  ssh -L localhost:3307:lightrail-mysql.vpc:3306 jeff.g@52.42.17.208
// prod: ssh -L localhost:3309:lightrail-mysql.vpc:3306 jeff.g@34.211.158.64

// Open a command line session
// mysql -v -h 127.0.0.1 -P $MYSQL_PORT -u $MYSQL_USER

async function main(): Promise<void> {
    const mysqlHost = "localhost";
    const mysqlPort = +await readLine("MySQL port (3307): ", "3307");
    const mysqlUser = await readLine("MySQL user name (dev-160928): ", "dev-160928");
    const mysqlPassword = await readPassword("MySQL database password: ");

    if ((await readLine(`Migrating from ${mysqlUser}@${mysqlHost}:${mysqlPort}, continue? (y/n) `)) !== "y") {
        console.log("Exiting...");
        process.exit();
    }

    const connection = await mysql.createConnection({
        host: mysqlHost,
        port: mysqlPort,
        user: mysqlUser,
        password: mysqlPassword,
        database: "giftbit_currency_schema"
    });

    console.log("Fetching users...");
    const userRows: {
        giftbit_user_id: string,
        username: string,
        team_member_id: string,
        date_created: Date
    }[] = (await connection.execute("select giftbit_user_id, username, team_member_id, date_created from giftbit_user where account_expired = 0 and account_locked = 0 and enabled = 1"))[0];

    console.log("Calculating DbAccounts...");
    const dbAccounts: DbAccount[] = userRows
        .filter(row => row.giftbit_user_id === row.team_member_id)
        .map(row => {
            const account: DbAccount = {
                accountId: row.giftbit_user_id,
                name: !row.username.match(/(giftbit.com|lightrail.com|uvic.ca|gmail.com)$/) ? row.username.replace(/(.*@)?(.*)/, "$2") : row.username,
                createdDate: row.date_created.toISOString()
            };
            return account;
        });
    const dbAccountMap = getMap(dbAccounts, "accountId");

    console.log("Calculating DbUsers...");
    const dbUsers: DbUser[] = userRows
        .map(row => {
            const user: DbUser = {
                userId: row.team_member_id,
                email: row.username,
                createdDate: row.date_created.toISOString()
            };
            return user;
        });
    const dbUserMap = getMap(dbUsers, "userId");

    console.log("Fetching roles...");
    const rolesRows: {
        giftbit_user_id: string,
        team_member_id: string,
        roleString: string
    }[] = (await connection.execute("select giftbit_user_id, team_member_id, GROUP_CONCAT(role SEPARATOR ', ') as roleString from granted_role group by team_member_id"))[0];
    const rolesMap = getMap(rolesRows, "team_member_id");

    console.log("Fetching scopes...");
    const scopesRows: {
        giftbit_user_id: string,
        team_member_id: string,
        scopeString: string
    }[] = (await connection.execute("select giftbit_user_id, team_member_id, GROUP_CONCAT(scope SEPARATOR ', ') as scopeString from granted_scope group by team_member_id"))[0];
    const scopesMap = getMap(scopesRows, "team_member_id");

    console.log("Calculating DbAccountUsers...");
    const dbAccountUsers = userRows
        .map(row => {
            const account = dbAccountMap[row.giftbit_user_id];
            if (!account) {
                console.warn(`Can't find Account ${row.giftbit_user_id} for User ${row.team_member_id}.  Account may be aexpired, locked or disabled.`);
                return null;
            }

            const user = dbUserMap[row.team_member_id];
            if (!user) {
                throw new Error(`Can't find User ${row.team_member_id}`);
            }

            const roles = rolesMap[row.team_member_id]?.roleString ?? "";
            const scopes = scopesMap[row.team_member_id]?.scopeString ?? "";

            const accountUser: DbAccountUser = {
                accountId: row.giftbit_user_id,
                userId: row.team_member_id,
                userDisplayName: user.email,
                accountDisplayName: account.name,
                roles: roles.split(",").map(s => s.trim()),
                scopes: scopes.split(",").map(s => s.trim()),
                createdDate: row.date_created.toISOString()
            };
            return accountUser;
        })
        .filter(a => !!a);
    console.log("dbAccountUsers=", dbAccountUsers);

    console.log("Done!");
    await connection.close();
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

function readPassword(prompt: string): Promise<string> {
    return new Promise<string>((resolve, reject) => {
        let password: string = "";
        process.stdout.write(prompt);
        process.stdin.setEncoding("utf8");
        process.stdin.setRawMode(true);
        process.stdin.resume();
        process.stdin.on("data", key => {
            if (key === "\u0003") {
                // CTRL-C support
                process.exit();
            } else if ((key as string).charCodeAt(0) === 13) {
                // Return
                process.stdout.write("\n");
                process.stdin.pause();
                process.stdin.setRawMode(false);
                resolve(password);
            } else {
                password += key;
                process.stdout.write("*");
            }
        });
    });
}

function readLine(prompt: string, defaultValue?: string): Promise<string> {
    process.stdout.write(prompt);
    return new Promise<string>((resolve) => {
        process.stdin.resume();
        process.stdin.once("data", data => {
            process.stdin.pause();
            const res = data.toString();
            resolve(res.substring(0, res.length - 1) || defaultValue);
        });
    });
}

main().then(console.log.bind(console)).catch(console.error.bind(console));
