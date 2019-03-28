import * as cassava from "cassava";
import * as giftbitRoutes from "giftbit-cassava-routes";
import {
    dynamodb,
    teamMemberByTeamMemberIdSchema,
    teamMemberDynameh,
    tokenActionDynameh,
    userByUserIdSchema,
    userDynameh
} from "../../dynamodb";
import {User} from "../../model/User";
import {TeamMember} from "../../model/TeamMember";
import log = require("loglevel");
import uuid = require("uuid/v4");

if (!process.env["TEST_ENV"]) {
    log.error("Env var TEST_ENV is undefined.  This is not a test environment!");
    throw new Error("Env var TEST_ENV is undefined.  This is not a test environment!");
}

export namespace defaultTestUser {
    export const userId = "user-testaccount";
    export const teamMemberId = "user-testuser";
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
    export const user: User = {
        userId: teamMemberId,
        email: "default-test-user@example.com",
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
    export const teamMember: TeamMember = {
        userId: userId,
        teamMemberId: teamMemberId,
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
        await dynamodb.deleteTable(teamMemberDynameh.requestBuilder.buildDeleteTableInput()).promise();
        await dynamodb.deleteTable(tokenActionDynameh.requestBuilder.buildDeleteTableInput()).promise();
        await dynamodb.deleteTable(userDynameh.requestBuilder.buildDeleteTableInput()).promise();
    } catch (err) {
        if (err.code !== "ResourceNotFoundException") {
            throw err;
        }
    }

    log.trace("creating tables");
    await dynamodb.createTable(teamMemberDynameh.requestBuilder.buildCreateTableInput([teamMemberByTeamMemberIdSchema])).promise();
    await dynamodb.createTable(tokenActionDynameh.requestBuilder.buildCreateTableInput()).promise();
    await dynamodb.createTable(userDynameh.requestBuilder.buildCreateTableInput([userByUserIdSchema])).promise();

    log.trace("adding default data");
    await dynamodb.putItem(userDynameh.requestBuilder.buildPutInput(defaultTestUser.user)).promise();
    await dynamodb.putItem(teamMemberDynameh.requestBuilder.buildPutInput(defaultTestUser.teamMember)).promise();
}

export function generateId(length?: number): string {
    return (uuid() + uuid()).substring(0, length != null ? length : 20);
}
