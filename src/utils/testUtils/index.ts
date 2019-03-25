import * as cassava from "cassava";
import * as giftbitRoutes from "giftbit-cassava-routes";
import {dynamodb, tokenActionDynameh, userByUserIdSchema, userDynameh} from "../../dynamodb";
import {User} from "../../model/User";
import log = require("loglevel");
import uuid = require("uuid/v4");

if (!process.env["TEST_ENV"]) {
    log.error("Env var TEST_ENV is undefined.  This is not a test environment!");
    throw new Error("Env var TEST_ENV is undefined.  This is not a test environment!");
}

export const defaultTestUser = {
    userId: "default-test-user",
    teamMemberId: "default-test-user",
    jwt: "eyJ2ZXIiOjIsInZhdiI6MSwiYWxnIjoiSFMyNTYiLCJ0eXAiOiJKV1QifQ.eyJnIjp7Imd1aSI6ImRlZmF1bHQtdGVzdC11c2VyLVRFU1QiLCJnbWkiOiJkZWZhdWx0LXRlc3QtdXNlci1URVNUIiwidG1pIjoiZGVmYXVsdC10ZXN0LXVzZXItVEVTVCJ9LCJpYXQiOiIyMDE3LTAzLTA3VDE4OjM0OjA2LjYwMyswMDAwIiwianRpIjoiYmFkZ2UtZGQ5NWI5YjU4MmU4NDBlY2JhMWNiZjQxMzY1ZDU3ZTEiLCJzY29wZXMiOltdLCJyb2xlcyI6WyJhY2NvdW50TWFuYWdlciIsImNvbnRhY3RNYW5hZ2VyIiwiY3VzdG9tZXJTZXJ2aWNlTWFuYWdlciIsImN1c3RvbWVyU2VydmljZVJlcHJlc2VudGF0aXZlIiwicG9pbnRPZlNhbGUiLCJwcm9ncmFtTWFuYWdlciIsInByb21vdGVyIiwicmVwb3J0ZXIiLCJzZWN1cml0eU1hbmFnZXIiLCJ0ZWFtQWRtaW4iLCJ3ZWJQb3J0YWwiXX0.Pz9XaaNX3HenvSUb6MENm_KEBheztiscGr2h2TJfhIc",
    cookie: "gb_jwt_session=eyJ2ZXIiOjIsInZhdiI6MSwiYWxnIjoiSFMyNTYiLCJ0eXAiOiJKV1QifQ.eyJnIjp7Imd1aSI6ImRlZmF1bHQtdGVzdC11c2VyLVRFU1QiLCJnbWkiOiJkZWZhdWx0LXRlc3QtdXNlci1URVNUIiwidG1pIjoiZGVmYXVsdC10ZXN0LXVzZXItVEVTVCJ9LCJpYXQiOiIyMDE3LTAzLTA3VDE4OjM0OjA2LjYwMyswMDAwIiwianRpIjoiYmFkZ2UtZGQ5NWI5YjU4MmU4NDBlY2JhMWNiZjQxMzY1ZDU3ZTEiLCJzY29wZXMiOltdLCJyb2xlcyI6WyJhY2NvdW50TWFuYWdlciIsImNvbnRhY3RNYW5hZ2VyIiwiY3VzdG9tZXJTZXJ2aWNlTWFuYWdlciIsImN1c3RvbWVyU2VydmljZVJlcHJlc2VudGF0aXZlIiwicG9pbnRPZlNhbGUiLCJwcm9ncmFtTWFuYWdlciIsInByb21vdGVyIiwicmVwb3J0ZXIiLCJzZWN1cml0eU1hbmFnZXIiLCJ0ZWFtQWRtaW4iLCJ3ZWJQb3J0YWwiXX0; gb_jwt_signature=Pz9XaaNX3HenvSUb6MENm_KEBheztiscGr2h2TJfhIc",
    auth: new giftbitRoutes.jwtauth.AuthorizationBadge({
        "g": {
            "gui": "default-test-user-TEST",
            "gmi": "default-test-user-TEST",
            "tmi": "default-test-user-TEST",
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
    }),
    password: "password",
    user: {
        userId: "default-test-user",
        email: "default-test-user@example.com",
        password: {
            algorithm: "BCRYPT",
            hash: "$2a$10$1A7dIgsPiB.Xf0kaHbVggOiI75vF8nU26MdDb6teeKq0B.AqaXLsy",
            dateCreated: "2017-03-07T18:34:06.603Z"
        },
        emailVerified: true,
        frozen: false,
        organizations: {
            "default-test-user": {
                userId: "default-test-user",
                teamMemberId: "default-test-user",
                jwtPayload: {
                    "g": {
                        "gui": "default-test-user-TEST",
                        "gmi": "default-test-user-TEST",
                        "tmi": "default-test-user-TEST"
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
                },
                dateCreated: "2017-03-07T18:34:06.603Z"
            }
        },
        dateCreated: "2017-03-07T18:34:06.603Z"
    } as User
};

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
        await dynamodb.deleteTable(tokenActionDynameh.requestBuilder.buildDeleteTableInput()).promise();
        await dynamodb.deleteTable(userDynameh.requestBuilder.buildDeleteTableInput()).promise();
    } catch (err) {
        if (err.code !== "ResourceNotFoundException") {
            throw err;
        }
    }

    log.trace("creating tables");
    await dynamodb.createTable(tokenActionDynameh.requestBuilder.buildCreateTableInput()).promise();
    await dynamodb.createTable(userDynameh.requestBuilder.buildCreateTableInput([userByUserIdSchema])).promise();

    log.trace("adding default data");
    await dynamodb.putItem(userDynameh.requestBuilder.buildPutInput(defaultTestUser.user)).promise();
}

export function generateId(length?: number): string {
    return (uuid() + uuid()).substring(0, length != null ? length : 20);
}
