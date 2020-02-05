import * as cassava from "cassava";
import * as chai from "chai";
import * as sinon from "sinon";
import * as emailUtils from "../../../utils/emailUtils";
import * as testUtils from "../../../utils/testUtils";
import {generateId} from "../../../utils/testUtils";
import {TestRouter} from "../../../utils/testUtils/TestRouter";
import {installUnauthedRestRoutes} from "../installUnauthedRestRoutes";
import {installAuthedRestRoutes} from "../installAuthedRestRoutes";
import {DbUserLogin} from "../../../db/DbUserLogin";

describe("/v2/user/forgotPassword", () => {

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

    it("accepts an unknown email address but no email is actually sent", async () => {
        let gotEmail = false;
        sinonSandbox.stub(emailUtils, "sendEmail")
            .callsFake(async (params: emailUtils.SendEmailParams) => {
                gotEmail = true;
                return null;
            });

        const forgotPasswordResp = await router.testUnauthedRequest<any>("/v2/user/forgotPassword", "POST", {
            email: "nosuchuser@example.com"
        });
        chai.assert.isFalse(gotEmail);
        chai.assert.equal(forgotPasswordResp.statusCode, cassava.httpStatusCode.success.OK);
    });

    it("can reset the password (using the webapp)", async () => {
        let resetPasswordEmail: emailUtils.SendEmailParams;
        sinonSandbox.stub(emailUtils, "sendEmail")
            .callsFake(async (params: emailUtils.SendEmailParams) => {
                resetPasswordEmail = params;
                return null;
            });

        const forgotPasswordResp = await router.testUnauthedRequest<any>("/v2/user/forgotPassword", "POST", {
            email: testUtils.defaultTestUser.userLogin.email
        });
        chai.assert.equal(forgotPasswordResp.statusCode, cassava.httpStatusCode.success.OK);
        chai.assert.isDefined(resetPasswordEmail);
        chai.assert.notMatch(resetPasswordEmail.htmlBody, /{{.*}}/, "No unreplaced tokens.");

        const resetPasswordToken = /https:\/\/.*resetPassword\?token=([a-zA-Z0-9]*)/.exec(resetPasswordEmail.htmlBody)[1];
        chai.assert.isString(resetPasswordToken, "Found reset password url in email body.");

        const password = generateId();
        const completeResp = await router.testUnauthedRequest<any>(`/v2/user/forgotPassword/complete`, "POST", {
            token: resetPasswordToken,
            password
        });
        chai.assert.equal(completeResp.statusCode, cassava.httpStatusCode.redirect.FOUND);
        chai.assert.isString(completeResp.headers["Location"]);

        // Old password doesn't work.
        const badLoginResp = await router.testUnauthedRequest<any>("/v2/user/login", "POST", {
            email: testUtils.defaultTestUser.userLogin.email,
            password: testUtils.defaultTestUser.password
        });
        chai.assert.equal(badLoginResp.statusCode, cassava.httpStatusCode.clientError.UNAUTHORIZED);

        // New password works.
        const loginResp = await router.testUnauthedRequest<any>("/v2/user/login", "POST", {
            email: testUtils.defaultTestUser.userLogin.email,
            password
        });
        chai.assert.equal(loginResp.statusCode, cassava.httpStatusCode.redirect.FOUND);
        chai.assert.isString(loginResp.headers["Set-Cookie"]);
        chai.assert.isString(loginResp.headers["Location"]);
        chai.assert.match(loginResp.headers["Set-Cookie"], /gb_jwt_session=([^ ;]+)/);
        chai.assert.match(loginResp.headers["Set-Cookie"], /gb_jwt_signature=([^ ;]+)/);

        // Can't use the same email to reset the password again
        const completeRepeatResp = await router.testUnauthedRequest<any>(`/v2/user/forgotPassword/complete`, "POST", {
            token: resetPasswordToken,
            password
        });
        chai.assert.equal(completeRepeatResp.statusCode, cassava.httpStatusCode.clientError.CONFLICT);
    });

    it("can't reset to a short password", async () => {
        let resetPasswordEmail: emailUtils.SendEmailParams;
        sinonSandbox.stub(emailUtils, "sendEmail")
            .callsFake(async (params: emailUtils.SendEmailParams) => {
                resetPasswordEmail = params;
                return null;
            });

        const forgotPasswordResp = await router.testUnauthedRequest<any>("/v2/user/forgotPassword", "POST", {
            email: testUtils.defaultTestUser.userLogin.email
        });
        chai.assert.equal(forgotPasswordResp.statusCode, cassava.httpStatusCode.success.OK);
        chai.assert.isDefined(resetPasswordEmail);
        chai.assert.notMatch(resetPasswordEmail.htmlBody, /{{.*}}/, "No unreplaced tokens.");

        const resetPasswordToken = /https:\/\/.*resetPassword\?token=([a-zA-Z0-9]*)/.exec(resetPasswordEmail.htmlBody)[1];
        chai.assert.isString(resetPasswordToken, "Found reset password url in email body.");

        const badCompleteResp = await router.testUnauthedRequest<any>(`/v2/user/forgotPassword/complete`, "POST", {
            token: resetPasswordToken,
            password: "tj5ptT#"
        });
        chai.assert.equal(badCompleteResp.statusCode, cassava.httpStatusCode.clientError.UNPROCESSABLE_ENTITY);
    });

    it("can't reset to a password of just digits", async () => {
        let resetPasswordEmail: emailUtils.SendEmailParams;
        sinonSandbox.stub(emailUtils, "sendEmail")
            .callsFake(async (params: emailUtils.SendEmailParams) => {
                resetPasswordEmail = params;
                return null;
            });

        const forgotPasswordResp = await router.testUnauthedRequest<any>("/v2/user/forgotPassword", "POST", {
            email: testUtils.defaultTestUser.userLogin.email
        });
        chai.assert.equal(forgotPasswordResp.statusCode, cassava.httpStatusCode.success.OK);
        chai.assert.isDefined(resetPasswordEmail);
        chai.assert.notMatch(resetPasswordEmail.htmlBody, /{{.*}}/, "No unreplaced tokens.");

        const resetPasswordToken = /https:\/\/.*resetPassword\?token=([a-zA-Z0-9]*)/.exec(resetPasswordEmail.htmlBody)[1];
        chai.assert.isString(resetPasswordToken, "Found reset password url in email body.");

        const badCompleteResp = await router.testUnauthedRequest<any>(`/v2/user/forgotPassword/complete`, "POST", {
            token: resetPasswordToken,
            password: "1234567654321"
        });
        chai.assert.equal(badCompleteResp.statusCode, cassava.httpStatusCode.clientError.UNPROCESSABLE_ENTITY);
    });

    it("can't reset to a very common password", async () => {
        let resetPasswordEmail: emailUtils.SendEmailParams;
        sinonSandbox.stub(emailUtils, "sendEmail")
            .callsFake(async (params: emailUtils.SendEmailParams) => {
                resetPasswordEmail = params;
                return null;
            });

        const forgotPasswordResp = await router.testUnauthedRequest<any>("/v2/user/forgotPassword", "POST", {
            email: testUtils.defaultTestUser.userLogin.email
        });
        chai.assert.equal(forgotPasswordResp.statusCode, cassava.httpStatusCode.success.OK);
        chai.assert.isDefined(resetPasswordEmail);
        chai.assert.notMatch(resetPasswordEmail.htmlBody, /{{.*}}/, "No unreplaced tokens.");

        const resetPasswordToken = /https:\/\/.*resetPassword\?token=([a-zA-Z0-9]*)/.exec(resetPasswordEmail.htmlBody)[1];
        chai.assert.isString(resetPasswordToken, "Found reset password url in email body.");

        const badCompleteResp = await router.testUnauthedRequest<any>(`/v2/user/forgotPassword/complete`, "POST", {
            token: resetPasswordToken,
            password: "baseball"
        });
        chai.assert.equal(badCompleteResp.statusCode, cassava.httpStatusCode.clientError.UNPROCESSABLE_ENTITY, badCompleteResp.bodyRaw);
    });

    it("requires a non-empty email address", async () => {
        const forgotPasswordResp = await router.testUnauthedRequest<any>("/v2/user/forgotPassword", "POST", {
            email: ""
        });
        chai.assert.equal(forgotPasswordResp.statusCode, cassava.httpStatusCode.clientError.UNPROCESSABLE_ENTITY);
    });

    it("requires a valid email address", async () => {
        const forgotPasswordResp = await router.testUnauthedRequest<any>("/v2/user/forgotPassword", "POST", {
            email: "notanemail"
        });
        chai.assert.equal(forgotPasswordResp.statusCode, cassava.httpStatusCode.clientError.UNPROCESSABLE_ENTITY);
    });
});
