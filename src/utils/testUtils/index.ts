import * as cassava from "cassava";
import * as chai from "chai";
import * as giftbitRoutes from "giftbit-cassava-routes";
import * as sinon from "sinon";
import * as uuid from "uuid";
import * as emailUtils from "../emailUtils";
import {dynamodb, objectDynameh, objectSchema2, tokenActionDynameh} from "../../db/dynamodb";
import {DbAccountUser} from "../../db/DbAccountUser";
import {DbUser} from "../../db/DbUser";
import {DbUserUniqueness} from "../../db/DbUserUniqueness";
import {DbAccount} from "../../db/DbAccount";
import {ParsedProxyResponse, TestRouter} from "./TestRouter";
import {generateTotpSecret} from "../secretsUtils";
import {LoginResult} from "../../model/LoginResult";
import {Invitation} from "../../model/Invitation";
import log = require("loglevel");

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
    export const user: DbUser = {
        userId: userId,
        email: email,
        login: {
            password: {
                algorithm: "BCRYPT",
                hash: "$2a$10$Q74mZB7vTMSlGTEbBwa71eqFjJt3zswf4.Vnhxx8t89QaM2vSCi5y",
                createdDate: "2017-03-07T18:34:06.603Z"
            },
            emailVerified: true,
            frozen: false,
            defaultLoginAccountId: accountId + "-TEST"
        },
        createdDate: "2017-03-07T18:34:06.603Z"
    };
    export const userUniqueness: DbUserUniqueness = {
        userId: userId
    };
    export const account: DbAccount = {
        accountId: accountId,
        name: "Test Account"
    };
    export const accountUser: DbAccountUser = {
        accountId: accountId,
        userId: userId,
        userDisplayName: email,
        accountDisplayName: account.name,
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
        export const user: DbUser = {
            userId: userId,
            email: email,
            login: {
                password: {
                    algorithm: "BCRYPT",
                    hash: "$2a$10$SOOnWX/DibG7SosygSsagOSJ1ddouwhkkrnqMVJGicnEYJLmbdpUC",
                    createdDate: "2019-04-08T21:09:21.127Z"
                },
                emailVerified: true,
                frozen: false,
                defaultLoginAccountId: accountId + "-TEST"
            },
            createdDate: "2019-04-08T21:09:21.127Z"
        };
        export const userUniqueness: DbUserUniqueness = {
            userId: userId
        };
        export const accountUser: DbAccountUser = {
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
    await DbUser.put(defaultTestUser.user);
    await DbUserUniqueness.put(defaultTestUser.userUniqueness);
    await DbAccount.put(defaultTestUser.account);
    await DbAccountUser.put(defaultTestUser.accountUser);
    await DbUser.put(defaultTestUser.teamMate.user);
    await DbUserUniqueness.put(defaultTestUser.teamMate.userUniqueness);
    await DbAccountUser.put(defaultTestUser.teamMate.accountUser);
}

/**
 * Create a new user in a new account.  This takes several calls and a lot of time for a unit
 * test.  Using the existing test users above is preferable but sometimes inappropriate.
 * @param router The TestRouter
 * @param sinonSandbox a sinon sandbox for the test in which emailUtils.sendEmail() can be mocked
 * @return the login response, which can be passsed into TestRouter.testPostLoginRequest()
 */
export async function testRegisterNewUser(router: TestRouter, sinonSandbox: sinon.SinonSandbox): Promise<{ loginResp: ParsedProxyResponse<LoginResult>, email: string, password: string }> {
    let verifyEmail: emailUtils.SendEmailParams;
    const emailStub = sinonSandbox.stub(emailUtils, "sendEmail")
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

    emailStub.restore();
    const token = /https:\/\/[a-z.]+\/v2\/user\/register\/verifyEmail\?token=([a-zA-Z0-9]*)/.exec(verifyEmail.htmlBody)[1];
    const verifyResp = await router.testUnauthedRequest<any>(`/v2/user/register/verifyEmail?token=${token}`, "GET");
    chai.assert.equal(verifyResp.statusCode, cassava.httpStatusCode.redirect.FOUND);

    const loginResp = await router.testUnauthedRequest<LoginResult>("/v2/user/login", "POST", {
        email,
        password
    });
    chai.assert.equal(loginResp.statusCode, cassava.httpStatusCode.redirect.FOUND);
    chai.assert.isUndefined(loginResp.body.messageCode);

    return {
        loginResp: loginResp,
        email: email,
        password: password
    };
}

export async function testInviteExistingUser(email: string, router: TestRouter, sinonSandbox: sinon.SinonSandbox): Promise<{ acceptInvitationResp: ParsedProxyResponse<LoginResult> }> {
    let invitationEmail: emailUtils.SendEmailParams;
    const emailStub = sinonSandbox.stub(emailUtils, "sendEmail")
        .callsFake(async (params: emailUtils.SendEmailParams) => {
            invitationEmail = params;
            return null;
        });

    const invitationResp = await router.testApiRequest<Invitation>("/v2/account/invitations", "POST", {
        email: email,
        userPrivilegeType: "FULL_ACCESS"
    });
    chai.assert.equal(invitationResp.statusCode, cassava.httpStatusCode.success.CREATED);

    emailStub.restore();
    const acceptInvitationToken = /https:\/\/[a-z.]+\/v2\/user\/register\/acceptInvitation\?token=([a-zA-Z0-9]*)/.exec(invitationEmail.htmlBody)[1];
    chai.assert.isString(acceptInvitationToken);

    const acceptInvitationResp = await router.testUnauthedRequest<LoginResult>(`/v2/user/register/acceptInvitation?token=${acceptInvitationToken}`, "GET");

    return {
        acceptInvitationResp
    };
}

/**
 * Create a new user in the default account.  This takes several calls and a lot of time for a unit
 * test.  Using the existing test users above is preferable but sometimes inappropriate.
 * @param router The TestRouter
 * @param sinonSandbox a sinon sandbox for the test in which emailUtils.sendEmail() can be mocked
 * @return the login response, which can be passsed into TestRouter.testPostLoginRequest()
 */
export async function testInviteNewUser(router: TestRouter, sinonSandbox: sinon.SinonSandbox): Promise<{ loginResp: ParsedProxyResponse<LoginResult>, email: string, password: string, userId: string }> {
    const email = generateId() + "@example.com";
    const invite = await testInviteExistingUser(email, router, sinonSandbox);
    const acceptInvitationResp = invite.acceptInvitationResp;

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

    const loginResp = await router.testUnauthedRequest<LoginResult>("/v2/user/login", "POST", {
        email,
        password
    });
    chai.assert.equal(loginResp.statusCode, cassava.httpStatusCode.redirect.FOUND);

    return {
        loginResp: loginResp,
        email: email,
        password: password,
        userId: loginResp.body.userId
    };
}

/**
 * Shortcut to enable TOTP MFA.  Enabling is properly tested elsewhere.
 * @param email
 */
export async function testEnableTotpMfa(email: string): Promise<string> {
    const user = await DbUser.get(email);
    const secret = await generateTotpSecret();
    const mfaSettings: DbUser.Mfa = {
        totpSecret: secret.encryptedTotpSecret,
        totpUsedCodes: {},
        trustedDevices: {}
    };
    await DbUser.update(user, {
        action: "put",
        attribute: "login.mfa",
        value: mfaSettings
    });
    return secret.totpSecret;
}

/**
 * Shortcut to enable SMS MFA.  Enabling is properly tested elsewhere.
 * @param email
 */
export async function testEnableSmsMfa(email: string): Promise<void> {
    const user = await DbUser.get(email);
    const mfaSettings: DbUser.Mfa = {
        smsDevice: "+15558675309",
        trustedDevices: {}
    };
    await DbUser.update(user, {
        action: "put",
        attribute: "login.mfa",
        value: mfaSettings
    });
}

export function generateId(length?: number): string {
    return (uuid.v4() + uuid.v4()).substring(0, length != null ? length : 20);
}
