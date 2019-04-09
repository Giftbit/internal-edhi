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

        const loginResp = await router.testUnauthedRequest<any>("/v2/user/login", "POST", {
            email,
            password
        });
        chai.assert.equal(loginResp.statusCode, cassava.httpStatusCode.redirect.FOUND);
        chai.assert.isString(loginResp.headers["Location"]);
        chai.assert.isString(loginResp.headers["Set-Cookie"]);
        chai.assert.match(loginResp.headers["Set-Cookie"], /gb_jwt_session=([^ ;]+)/);
        chai.assert.match(loginResp.headers["Set-Cookie"], /gb_jwt_signature=([^ ;]+)/);

        const pingResp = await router.testPostLoginRequest(loginResp, "/v2/user/ping", "GET");
        chai.assert.equal(pingResp.statusCode, cassava.httpStatusCode.success.OK, JSON.stringify(pingResp.body));
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

    it("cannot verifyEmail with a bad token", async () => {
        const resp = await router.testUnauthedRequest<any>("/v2/user/register/verifyEmail?token=asdfasdfasdf", "GET");
        chai.assert.equal(resp.statusCode, cassava.httpStatusCode.clientError.NOT_FOUND);
    });

    it("sends an account recovery email when someone attempts to register with a taken email address", async () => {
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
        const completeResp = await router.testUnauthedRequest<any>(`/v2/user/forgotPassword/complete`, "POST", {
            token: resetPasswordToken,
            password
        });
        chai.assert.equal(completeResp.statusCode, cassava.httpStatusCode.redirect.FOUND);
        chai.assert.isString(completeResp.headers["Location"]);
    });
});
