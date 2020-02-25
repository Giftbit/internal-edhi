import * as cassava from "cassava";
import * as chai from "chai";
import * as giftbitRoutes from "giftbit-cassava-routes";
import * as sinon from "sinon";
import * as emailUtils from "../emailUtils";
import {dynamodb, objectDynameh, objectSchema2, tokenActionDynameh} from "../../db/dynamodb";
import {DbAccountUser} from "../../db/DbAccountUser";
import {DbUserLogin} from "../../db/DbUserLogin";
import {DbUser} from "../../db/DbUser";
import {DbAccount} from "../../db/DbAccount";
import {ParsedProxyResponse, TestRouter} from "./TestRouter";
import {generateOtpSecret} from "../otpUtils";
import {LoginResult} from "../../model/LoginResult";
import {Invitation} from "../../model/Invitation";
import log = require("loglevel");
import uuid = require("uuid/v4");

if (!process.env["TEST_ENV"]) {
    log.error("Env var TEST_ENV is undefined.  This is not a test environment!");
    throw new Error("Env var TEST_ENV is undefined.  This is not a test environment!");
}

export namespace defaultTestUser {
    export const accountId = "user-testaccount";
    export const userId = "user-testuser";
    export const email = "default-test-user@example.com";
    export const auth = new giftbitRoutes.jwtauth.AuthorizationBadge({
        "g": {
            "gui": accountId + "-TEST",
            "tmi": userId + "-TEST",
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
    export const password = "Lw0^d8Sx";
    export const userLogin: DbUserLogin = {
        userId: userId,
        email: email,
        password: {
            algorithm: "BCRYPT",
            hash: "$2a$10$Q74mZB7vTMSlGTEbBwa71eqFjJt3zswf4.Vnhxx8t89QaM2vSCi5y",
            createdDate: "2017-03-07T18:34:06.603Z"
        },
        emailVerified: true,
        frozen: false,
        defaultLoginAccountId: accountId + "-TEST",
        createdDate: "2017-03-07T18:34:06.603Z"
    };
    export const userDetails: DbUser = {
        userId: userId,
        email: email
    };
    export const accountDetails: DbAccount = {
        accountId: accountId,
        name: "Test Account"
    };
    export const teamMember: DbAccountUser = {
        accountId: accountId,
        userId: userId,
        userDisplayName: email,
        accountDisplayName: accountDetails.name,
        roles: auth.roles,
        scopes: [],
        createdDate: "2017-03-07T18:34:06.603Z"
    };

    export namespace teamMate {
        export const userId = "user-testteammate";
        export const email = "teammate@example.com";
        export const auth = new giftbitRoutes.jwtauth.AuthorizationBadge({
            "g": {
                "gui": accountId + "-TEST",
                "tmi": userId + "-TEST",
            },
            "iat": "2019-04-08T21:09:21.127Z",
            "jti": "badge-0ab6d47706c94cf8a83197cdce4dcc94",
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
        export const password = "0Gb1@KN$";
        export const userLogin: DbUserLogin = {
            userId: userId,
            email: email,
            password: {
                algorithm: "BCRYPT",
                hash: "$2a$10$SOOnWX/DibG7SosygSsagOSJ1ddouwhkkrnqMVJGicnEYJLmbdpUC",
                createdDate: "2019-04-08T21:09:21.127Z"
            },
            emailVerified: true,
            frozen: false,
            defaultLoginAccountId: accountId + "-TEST",
            createdDate: "2019-04-08T21:09:21.127Z"
        };
        export const userDetails: DbUser = {
            userId: userId,
            email: email
        };
        export const teamMember: DbAccountUser = {
            accountId: accountId,
            userId: userId,
            userDisplayName: email,
            accountDisplayName: "Test Account",
            roles: auth.roles,
            scopes: [],
            createdDate: "2019-04-08T21:09:21.127Z"
        };
    }
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
    await dynamodb.createTable(objectDynameh.requestBuilder.buildCreateTableInput([objectSchema2])).promise();
    await dynamodb.createTable(tokenActionDynameh.requestBuilder.buildCreateTableInput()).promise();

    log.trace("adding default data");
    await dynamodb.putItem(objectDynameh.requestBuilder.buildPutInput(DbUserLogin.toDbObject(defaultTestUser.userLogin))).promise();
    await dynamodb.putItem(objectDynameh.requestBuilder.buildPutInput(DbUser.toDbObject(defaultTestUser.userDetails))).promise();
    await dynamodb.putItem(objectDynameh.requestBuilder.buildPutInput(DbAccount.toDbObject(defaultTestUser.accountDetails))).promise();
    await dynamodb.putItem(objectDynameh.requestBuilder.buildPutInput(DbAccountUser.toDbObject(defaultTestUser.teamMember))).promise();
    await dynamodb.putItem(objectDynameh.requestBuilder.buildPutInput(DbUserLogin.toDbObject(defaultTestUser.teamMate.userLogin))).promise();
    await dynamodb.putItem(objectDynameh.requestBuilder.buildPutInput(DbUser.toDbObject(defaultTestUser.teamMate.userDetails))).promise();
    await dynamodb.putItem(objectDynameh.requestBuilder.buildPutInput(DbAccountUser.toDbObject(defaultTestUser.teamMate.teamMember))).promise();
}

/**
 * Create a new user in a new account.  This takes several calls and a lot of time for a unit
 * test.  Using the existing test users above is preferable but sometimes inappropriate.
 * @param router The TestRouter
 * @param sinonSandbox a sinon sandbox for the test in which emailUtils.sendEmail() can be mocked
 * @return the login response, which can be passsed into TestRouter.testPostLoginRequest()
 */
export async function getNewUser(router: TestRouter, sinonSandbox: sinon.SinonSandbox): Promise<{ loginResp: ParsedProxyResponse<LoginResult>, email: string, password: string }> {
    let verifyEmail: emailUtils.SendEmailParams;
    sinonSandbox.stub(emailUtils, "sendEmail")
        .callsFake(async (params: emailUtils.SendEmailParams) => {
            verifyEmail = params;
            return null;
        });

    const email = `unittest-${generateId()}@example.com`;
    const password = generateId();
    const registerResp = await router.testUnauthedRequest<any>("/v2/user/register", "POST", {
        email,
        password
    });
    chai.assert.equal(registerResp.statusCode, cassava.httpStatusCode.success.CREATED);

    const token = /https:\/\/[a-z.]+\/v2\/user\/register\/verifyEmail\?token=([a-zA-Z0-9]*)/.exec(verifyEmail.htmlBody)[1];
    const verifyResp = await router.testUnauthedRequest<any>(`/v2/user/register/verifyEmail?token=${token}`, "GET");
    chai.assert.equal(verifyResp.statusCode, cassava.httpStatusCode.redirect.FOUND);

    const loginResp = await router.testUnauthedRequest<any>("/v2/user/login", "POST", {
        email,
        password
    });
    chai.assert.equal(loginResp.statusCode, cassava.httpStatusCode.redirect.FOUND);

    return {
        loginResp: loginResp,
        email: email,
        password: password
    };
}

/**
 * Create a new user in the default account.  This takes several calls and a lot of time for a unit
 * test.  Using the existing test users above is preferable but sometimes inappropriate.
 * @param router The TestRouter
 * @param sinonSandbox a sinon sandbox for the test in which emailUtils.sendEmail() can be mocked
 * @return the login response, which can be passsed into TestRouter.testPostLoginRequest()
 */
export async function inviteNewUser(router: TestRouter, sinonSandbox: sinon.SinonSandbox): Promise<{ loginResp: ParsedProxyResponse<LoginResult>, email: string, password: string, userId: string }> {
    let invitationEmail: emailUtils.SendEmailParams;
    sinonSandbox.stub(emailUtils, "sendEmail")
        .callsFake(async (params: emailUtils.SendEmailParams) => {
            invitationEmail = params;
            return null;
        });

    const email = generateId() + "@example.com";
    const invitationResp = await router.testApiRequest<Invitation>("/v2/account/invitations", "POST", {
        email: email,
        userPrivilegeType: "FULL_ACCESS"
    });
    chai.assert.equal(invitationResp.statusCode, cassava.httpStatusCode.success.CREATED);

    const acceptInvitationToken = /https:\/\/[a-z.]+\/v2\/user\/register\/acceptInvitation\?token=([a-zA-Z0-9]*)/.exec(invitationEmail.htmlBody)[1];
    chai.assert.isString(acceptInvitationToken);

    const acceptInvitationResp = await router.testUnauthedRequest(`/v2/user/register/acceptInvitation?token=${acceptInvitationToken}`, "GET");
    chai.assert.equal(acceptInvitationResp.statusCode, cassava.httpStatusCode.redirect.FOUND, acceptInvitationResp.bodyRaw);
    chai.assert.isString(acceptInvitationResp.headers["Location"]);
    chai.assert.match(acceptInvitationResp.headers["Location"], /https:\/\/.*resetPassword\?token=[a-zA-Z0-9]*/);

    const resetPasswordToken = /https:\/\/.*resetPassword\?token=([a-zA-Z0-9]*)/.exec(acceptInvitationResp.headers["Location"])[1];
    chai.assert.isString(resetPasswordToken);

    const password = generateId();
    const completeResp = await router.testUnauthedRequest<any>(`/v2/user/forgotPassword/complete`, "POST", {
        token: resetPasswordToken,
        password
    });
    chai.assert.equal(completeResp.statusCode, cassava.httpStatusCode.redirect.FOUND);

    const loginResp = await router.testUnauthedRequest<any>("/v2/user/login", "POST", {
        email,
        password
    });
    chai.assert.equal(loginResp.statusCode, cassava.httpStatusCode.redirect.FOUND);

    return {
        loginResp: loginResp,
        email: email,
        password: password,
        userId: invitationResp.body.userId
    };
}

/**
 * Shortcut to enable TOTP MFA.  Enabling is properly tested elsewhere.
 * @param email
 */
export async function enableTotpMfa(email: string): Promise<string> {
    const userLogin = await DbUserLogin.get(email);
    const secret = await generateOtpSecret();
    const mfaSettings: DbUserLogin.Mfa = {
        totpSecret: secret,
        totpUsedCodes: {},
        trustedDevices: {}
    };
    await DbUserLogin.update(userLogin, {
        action: "put",
        attribute: "mfa",
        value: mfaSettings
    });
    return secret;
}

/**
 * Shortcut to enable SMS MFA.  Enabling is properly tested elsewhere.
 * @param email
 */
export async function enableSmsMfa(email: string): Promise<void> {
    const userLogin = await DbUserLogin.get(email);
    const mfaSettings: DbUserLogin.Mfa = {
        smsDevice: "+15558675309",
        trustedDevices: {}
    };
    await DbUserLogin.update(userLogin, {
        action: "put",
        attribute: "mfa",
        value: mfaSettings
    });
}

export function generateId(length?: number): string {
    return (uuid() + uuid()).substring(0, length != null ? length : 20);
}
