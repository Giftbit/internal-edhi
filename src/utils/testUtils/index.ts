import * as cassava from "cassava";
import * as giftbitRoutes from "giftbit-cassava-routes";
import {dynamodb, objectDynameh, objectReverseIndexSchema, tokenActionDynameh,} from "../../db/dynamodb";
import {DbTeamMember} from "../../db/DbTeamMember";
import {DbUserLogin} from "../../db/DbUserLogin";
import {DbUserDetails} from "../../db/DbUserDetails";
import log = require("loglevel");
import uuid = require("uuid/v4");

if (!process.env["TEST_ENV"]) {
    log.error("Env var TEST_ENV is undefined.  This is not a test environment!");
    throw new Error("Env var TEST_ENV is undefined.  This is not a test environment!");
}

export namespace defaultTestUser {
    export const userId = "user-testaccount";
    export const teamMemberId = "user-testuser";
    export const email = "default-test-user@example.com";
    export const auth = new giftbitRoutes.jwtauth.AuthorizationBadge({
        "g": {
            "gui": userId + "-TEST",
            "tmi": teamMemberId + "-TEST",
        },
        "iat": "2017-03-07T18:34:06.603+0000",
        "jti": "badge-dd95b9b582e840ecba1cbf41365d57e1",
        "scopes": [],
        "roles": [
            "accountManager",
            "contactManager",
            "customerServiceManager",
            "customerServiceRepresentative",
            "pointOfSale",
            "programManager",
            "promoter",
            "reporter",
            "securityManager",
            "teamAdmin",
            "webPortal"
        ]
    });
    export const jwt = auth.sign("secret");
    export const cookie = `gb_jwt_session=${/([^.]+\.[^.]+)/.exec(jwt)[1]}; gb_jwt_signature=${/[^.]+\.[^.]+\.([^.]+)/.exec(jwt)[1]}`;
    export const password = "password";
    export const userLogin: DbUserLogin = {
        userId: teamMemberId,
        email: email,
        password: {
            algorithm: "BCRYPT",
            hash: "$2a$10$1A7dIgsPiB.Xf0kaHbVggOiI75vF8nU26MdDb6teeKq0B.AqaXLsy",
            dateCreated: "2017-03-07T18:34:06.603Z"
        },
        emailVerified: true,
        frozen: false,
        defaultLoginUserId: userId + "-TEST",
        dateCreated: "2017-03-07T18:34:06.603Z"
    };
    export const userDetails: DbUserDetails = {
        userId: teamMemberId,
        email: email
    };
    export const teamMember: DbTeamMember = {
        userId: userId,
        teamMemberId: teamMemberId,
        userDisplayName: email,
        accountDisplayName: "Test Organization",
        roles: auth.roles,
        dateCreated: "2017-03-07T18:34:06.603Z"
    };
}

/**
 * A Cassava Route that enables authorization with the above JWTs.
 */
export const authRoute: cassava.routes.Route = new giftbitRoutes.jwtauth.JwtAuthorizationRoute({
    authConfigPromise: Promise.resolve({secretkey: "secret"}),
    rolesConfigPromise: Promise.resolve(require("./rolesConfig.json")),
    infoLogFunction: () => {
        // too noisy for testing
    },
    errorLogFunction: log.error
});

export async function resetDb(): Promise<void> {
    log.trace("deleting existing tables");
    try {
        await dynamodb.deleteTable(objectDynameh.requestBuilder.buildDeleteTableInput()).promise();
        await dynamodb.deleteTable(tokenActionDynameh.requestBuilder.buildDeleteTableInput()).promise();
    } catch (err) {
        if (err.code !== "ResourceNotFoundException") {
            throw err;
        }
    }

    log.trace("creating tables");
    await dynamodb.createTable(objectDynameh.requestBuilder.buildCreateTableInput([objectReverseIndexSchema])).promise();
    await dynamodb.createTable(tokenActionDynameh.requestBuilder.buildCreateTableInput()).promise();

    log.trace("adding default data");
    await dynamodb.putItem(objectDynameh.requestBuilder.buildPutInput(DbUserLogin.toDbObject(defaultTestUser.userLogin))).promise();
    await dynamodb.putItem(objectDynameh.requestBuilder.buildPutInput(DbUserDetails.toDbObject(defaultTestUser.userDetails))).promise();
    await dynamodb.putItem(objectDynameh.requestBuilder.buildPutInput(DbTeamMember.toDbObject(defaultTestUser.teamMember))).promise();
}

export function generateId(length?: number): string {
    return (uuid() + uuid()).substring(0, length != null ? length : 20);
}
