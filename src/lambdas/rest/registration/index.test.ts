import * as cassava from "cassava";
import * as chai from "chai";
import * as sinon from "sinon";
import * as emailUtils from "../../../utils/emailUtils";
import * as testUtils from "../../../utils/testUtils";
import {generateId} from "../../../utils/testUtils";
import {installUnauthedRestRoutes} from "../installUnauthedRestRoutes";
import {TestRouter} from "../../../utils/testUtils/TestRouter";
import {installAuthedRestRoutes} from "../installAuthedRestRoutes";
import {DbUserLogin} from "../../../db/DbUserLogin";
import {AccountUser} from "../../../model/AccountUser";
import {Invitation} from "../../../model/Invitation";
import {LoginResult} from "../../../model/LoginResult";
import {Account} from "../../../model/Account";

describe("/v2/user/register", () => {

    const router = new TestRouter();
    const sinonSandbox = sinon.createSandbox();

    before(async () => {
        await testUtils.resetDb();
        installUnauthedRestRoutes(router);
        router.route(testUtils.authRoute);
        installAuthedRestRoutes(router);
        DbUserLogin.initializeBadgeSigningSecrets(Promise.resolve({secretkey: "secret"}));
    });

    afterEach(() => {
        sinonSandbox.restore();
    });

    it("can register a new user, send an email, verifyEmail, login", async () => {
        let verifyEmail: emailUtils.SendEmailParams;
        sinonSandbox.stub(emailUtils, "sendEmail")
            .callsFake(async (params: emailUtils.SendEmailParams) => {
                verifyEmail = params;
                return null;
            });

        const email = generateId() + "@example.com";
        const password = generateId();
        const registerResp = await router.testUnauthedRequest<any>("/v2/user/register", "POST", {
            email,
            password
        });
        chai.assert.equal(registerResp.statusCode, cassava.httpStatusCode.success.CREATED);
        chai.assert.isString(verifyEmail.htmlBody);
        chai.assert.notMatch(verifyEmail.htmlBody, /{{.*}}/, "No unreplaced tokens.");

        const verifyUrl = /(https:\/\/[a-z.]+\/v2\/user\/register\/verifyEmail\?token=[a-zA-Z0-9]*)/.exec(verifyEmail.htmlBody)[1];
        chai.assert.isString(verifyUrl, "Found verify url in email body.");
        const token = /\/v2\/user\/register\/verifyEmail\?token=(.*)/.exec(verifyUrl)[1];
        const verifyResp = await router.testUnauthedRequest<any>(`/v2/user/register/verifyEmail?token=${token}`, "GET");
        chai.assert.equal(verifyResp.statusCode, cassava.httpStatusCode.redirect.FOUND);
        chai.assert.isString(verifyResp.headers["Location"]);

        const badLoginResp = await router.testUnauthedRequest<any>("/v2/user/login", "POST", {
            email,
            password: "not the right password"
        });
        chai.assert.equal(badLoginResp.statusCode, cassava.httpStatusCode.clientError.UNAUTHORIZED);

        const loginResp = await router.testUnauthedRequest<LoginResult>("/v2/user/login", "POST", {
            email,
            password
        });
        chai.assert.equal(loginResp.statusCode, cassava.httpStatusCode.redirect.FOUND);
        chai.assert.isUndefined(loginResp.body.messageCode);
        chai.assert.isString(loginResp.headers["Location"]);
        chai.assert.isString(loginResp.headers["Set-Cookie"]);
        chai.assert.match(loginResp.headers["Set-Cookie"], /gb_jwt_session=([^ ;]+)/);
        chai.assert.match(loginResp.headers["Set-Cookie"], /gb_jwt_signature=([^ ;]+)/);

        const pingResp = await router.testPostLoginRequest(loginResp, "/v2/user/ping", "GET");
        chai.assert.equal(pingResp.statusCode, cassava.httpStatusCode.success.OK, pingResp.bodyRaw);

        const accountUsersResp = await router.testWebAppRequest<AccountUser[]>("/v2/account/users", "GET");
        chai.assert.equal(accountUsersResp.statusCode, cassava.httpStatusCode.success.OK);
        chai.assert.lengthOf(accountUsersResp.body, 2, "2 users in the account now");
        chai.assert.isTrue(accountUsersResp.body.every(user => user.roles.length > 0), "every user has at least 1 role");
    });

    it("cannot register an invalid email", async () => {
        const registerResp = await router.testUnauthedRequest<any>("/v2/user/register", "POST", {
            email: "notanemail",
            password: generateId()
        });
        chai.assert.equal(registerResp.statusCode, cassava.httpStatusCode.clientError.UNPROCESSABLE_ENTITY);
    });

    it("cannot register a user with a short password", async () => {
        const registerResp = await router.testUnauthedRequest<any>("/v2/user/register", "POST", {
            email: "shortpass@example.com",
            password: "1234"
        });
        chai.assert.equal(registerResp.statusCode, cassava.httpStatusCode.clientError.UNPROCESSABLE_ENTITY);
    });

    it("cannot register a user with an incredibly long password", async () => {
        const registerResp = await router.testUnauthedRequest<any>("/v2/user/register", "POST", {
            email: "longpass@example.com",
            password: "Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in"
        });
        chai.assert.equal(registerResp.statusCode, cassava.httpStatusCode.clientError.UNPROCESSABLE_ENTITY);
    });

    it("cannot register a user with a common password", async () => {
        const registerResp = await router.testUnauthedRequest<any>("/v2/user/register", "POST", {
            email: "commonpass@example.com",
            password: "edmonton"
        });
        chai.assert.equal(registerResp.statusCode, cassava.httpStatusCode.clientError.UNPROCESSABLE_ENTITY);
    });

    it("cannot verifyEmail with a bad token", async () => {
        const resp = await router.testUnauthedRequest<any>("/v2/user/register/verifyEmail?token=asdfasdfasdf", "GET");
        chai.assert.equal(resp.statusCode, cassava.httpStatusCode.clientError.NOT_FOUND);
    });

    it("sends an account recovery email when someone attempts to register with a email that already has an account", async () => {
        let recoverEmail: emailUtils.SendEmailParams;
        sinonSandbox.stub(emailUtils, "sendEmail")
            .callsFake(async (params: emailUtils.SendEmailParams) => {
                recoverEmail = params;
                return null;
            });

        const registerResp = await router.testUnauthedRequest<any>("/v2/user/register", "POST", {
            email: testUtils.defaultTestUser.email,
            password: generateId()
        });
        chai.assert.equal(registerResp.statusCode, cassava.httpStatusCode.success.CREATED);
        chai.assert.isDefined(recoverEmail);
        chai.assert.notMatch(recoverEmail.htmlBody, /{{.*}}/, "No unreplaced tokens.");

        const resetPasswordToken = /https:\/\/.*resetPassword\?token=([a-zA-Z0-9]*)/.exec(recoverEmail.htmlBody)[1];
        chai.assert.isString(resetPasswordToken, "Found reset password url in email body.");

        const password = generateId();
        const completeResp = await router.testUnauthedRequest<LoginResult>(`/v2/user/forgotPassword/complete`, "POST", {
            token: resetPasswordToken,
            password
        });
        chai.assert.equal(completeResp.statusCode, cassava.httpStatusCode.redirect.FOUND);
        chai.assert.isUndefined(completeResp.body.messageCode);
        chai.assert.isString(completeResp.headers["Location"]);
    });

    it("sends an account recovery email to someone who was previously invited but then the invitation was deleted (which can then only create an account which is kinda lame but too endge-casey to optimize)", async () => {
        let invitationEmail: emailUtils.SendEmailParams;
        let recoverEmail: emailUtils.SendEmailParams;
        sinonSandbox.stub(emailUtils, "sendEmail")
            .onFirstCall()
            .callsFake(async (params: emailUtils.SendEmailParams) => {
                invitationEmail = params;
                return null;
            })
            .onSecondCall()
            .callsFake(async (params: emailUtils.SendEmailParams) => {
                recoverEmail = params;
                return null;
            });

        const email = testUtils.generateId() + "@example.com";
        const inviteResp = await router.testApiRequest<Invitation>("/v2/account/invitations", "POST", {
            email: email,
            userPrivilegeType: "FULL_ACCESS"
        });
        chai.assert.equal(inviteResp.statusCode, cassava.httpStatusCode.success.CREATED);
        chai.assert.equal(inviteResp.body.accountId, testUtils.defaultTestUser.accountId);
        chai.assert.equal(inviteResp.body.email, email);

        const deleteInvitationResp = await router.testApiRequest<Invitation>(`/v2/account/invitations/${inviteResp.body.userId}`, "DELETE");
        chai.assert.equal(deleteInvitationResp.statusCode, cassava.httpStatusCode.success.OK);

        const registerResp = await router.testUnauthedRequest<any>("/v2/user/register", "POST", {
            email: email,
            password: generateId()
        });
        chai.assert.equal(registerResp.statusCode, cassava.httpStatusCode.success.CREATED);
        chai.assert.isDefined(recoverEmail);
        chai.assert.notMatch(recoverEmail.htmlBody, /{{.*}}/, "No unreplaced tokens.");

        // Because the user gets a recover password email rather than standard registration.
        const resetPasswordToken = /https:\/\/.*resetPassword\?token=([a-zA-Z0-9]*)/.exec(recoverEmail.htmlBody)[1];
        chai.assert.isString(resetPasswordToken, "Found reset password url in email body.");

        const password = generateId();
        const completeResp = await router.testUnauthedRequest<void>(`/v2/user/forgotPassword/complete`, "POST", {
            token: resetPasswordToken,
            password
        });
        chai.assert.equal(completeResp.statusCode, cassava.httpStatusCode.redirect.FOUND);

        const loginResp = await router.testUnauthedRequest<LoginResult>("/v2/user/login", "POST", {
            email,
            password
        });
        chai.assert.equal(loginResp.statusCode, cassava.httpStatusCode.redirect.FOUND, loginResp.bodyRaw);
        chai.assert.equal(loginResp.body.messageCode, "NoAccount");
        chai.assert.isString(loginResp.headers["Location"]);
        chai.assert.isString(loginResp.headers["Set-Cookie"]);

        const createAccountResp = await router.testPostLoginRequest<Account>(loginResp, "/v2/account", "POST", {
            name: "Totally Not a Drug Front"
        });
        chai.assert.equal(createAccountResp.statusCode, cassava.httpStatusCode.success.CREATED);
        chai.assert.equal(createAccountResp.body.name, "Totally Not a Drug Front");
    });
});
