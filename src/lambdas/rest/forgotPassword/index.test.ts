import * as chai from "chai";
import * as sinon from "sinon";
import * as testUtils from "../../../utils/testUtils";
import {generateId} from "../../../utils/testUtils";
import {TestRouter} from "../../../utils/testUtils/TestRouter";
import {installUnauthedRestRoutes} from "../installUnauthedRestRoutes";
import {installAuthedRestRoutes} from "../installAuthedRestRoutes";
import {initializeBadgeSigningSecrets} from "../login";
import * as emailUtils from "../../../utils/emailUtils";
import * as cassava from "cassava";

describe("/v2/user/forgotPassword", () => {

    const router = new TestRouter();
    const sinonSandbox = sinon.createSandbox();

    before(async () => {
        await testUtils.resetDb();
        installUnauthedRestRoutes(router);
        router.route(testUtils.authRoute);
        installAuthedRestRoutes(router);
        initializeBadgeSigningSecrets(Promise.resolve({secretkey: "secret"}));
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

        const registerResp = await router.testUnauthedRequest<any>("/v2/user/forgotPassword", "POST", {
            email: "nosuchuser@example.com"
        });
        chai.assert.equal(registerResp.statusCode, cassava.httpStatusCode.success.OK);
    });

    it("can reset the password (using the webapp)", async () => {
        let resetPasswordUrl: string;
        sinonSandbox.stub(emailUtils, "sendEmail")
            .callsFake(async (params: emailUtils.SendEmailParams) => {
                const resetPasswordMatcher = /(https:\/\/.*resetPassword\?token=[a-zA-Z0-9]*)/.exec(params.htmlBody);
                resetPasswordUrl = resetPasswordMatcher[1];
                return null;
            });

        const forgotPasswordResp = await router.testUnauthedRequest<any>("/v2/user/forgotPassword", "POST", {
            email: testUtils.defaultTestUser.user.email
        });
        chai.assert.equal(forgotPasswordResp.statusCode, cassava.httpStatusCode.success.OK);
        chai.assert.isString(resetPasswordUrl, "Found reset password url in email body.");
        const token = /\?token=(.*)/.exec(resetPasswordUrl)[1];

        // Can't reset to a short password.
        const badResetResp = await router.testUnauthedRequest<any>(`/v2/user/forgotPassword/reset`, "POST", {
            token,
            password: "1234"
        });
        chai.assert.equal(badResetResp.statusCode, cassava.httpStatusCode.clientError.UNPROCESSABLE_ENTITY);
        
        const password = generateId();
        const resetResp = await router.testUnauthedRequest<any>(`/v2/user/forgotPassword/reset`, "POST", {
            token,
            password
        });
        chai.assert.equal(resetResp.statusCode, cassava.httpStatusCode.redirect.FOUND);
        chai.assert.isString(resetResp.headers["Location"]);

        // Old password doesn't work.
        const badLoginResp = await router.testUnauthedRequest<any>("/v2/user/login", "POST", {
            email: testUtils.defaultTestUser.user.email,
            password: testUtils.defaultTestUser.password
        });
        chai.assert.equal(badLoginResp.statusCode, cassava.httpStatusCode.clientError.UNAUTHORIZED);

        // New password works.
        const loginResp = await router.testUnauthedRequest<any>("/v2/user/login", "POST", {
            email: testUtils.defaultTestUser.user.email,
            password
        });
        chai.assert.equal(loginResp.statusCode, cassava.httpStatusCode.redirect.FOUND);
        chai.assert.isString(loginResp.headers["Set-Cookie"]);
        chai.assert.isString(loginResp.headers["Location"]);
        chai.assert.match(loginResp.headers["Set-Cookie"], /gb_jwt_session=([^ ;]+)/);
        chai.assert.match(loginResp.headers["Set-Cookie"], /gb_jwt_signature=([^ ;]+)/);
    });
});
