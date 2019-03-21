import * as cassava from "cassava";
import * as chai from "chai";
import * as sinon from "sinon";
import * as emailUtils from "../../../utils/emailUtils";
import * as testUtils from "../../../utils/testUtils";
import {generateId} from "../../../utils/testUtils";
import {installUnauthedRestRoutes} from "../installUnauthedRestRoutes";
import {TestRouter} from "../../../utils/testUtils/TestRouter";
import {initializeBadgeSigningSecrets} from "../login";
import {installAuthedRestRoutes} from "../installAuthedRestRoutes";

describe("/v2/user/register", () => {

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

    it("can register a new user, send an email, verifyEmail, login", async () => {
        let verifyUrl: string;
        sinonSandbox.stub(emailUtils, "sendEmail")
            .callsFake(async (params: emailUtils.SendEmailParams) => {
                const verifyEmailMatcher = /(https:\/\/[a-z.]+\/v2\/user\/register\/verifyEmail\?token=[a-zA-Z0-9]*)/.exec(params.htmlBody);
                verifyUrl = verifyEmailMatcher[1];
                return null;
            });

        const email = generateId() + "@example.com";
        const password = generateId();
        const registerResp = await router.testUnauthedRequest<any>("/v2/user/register", "POST", {
            email,
            password
        });
        chai.assert.equal(registerResp.statusCode, cassava.httpStatusCode.success.CREATED);
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
        chai.assert.isString(loginResp.headers["Set-Cookie"]);
        chai.assert.isString(loginResp.headers["Location"]);

        const sessionCookie = /gb_jwt_session=([^ ;]+)/.exec(loginResp.headers["Set-Cookie"])[1];
        const signatureCookie = /gb_jwt_signature=([^ ;]+)/.exec(loginResp.headers["Set-Cookie"])[1];
        chai.assert.isString(sessionCookie, "Got session cookie from " + loginResp.headers["Set-Cookie"]);
        chai.assert.isString(signatureCookie, "Got signature cookie from " + loginResp.headers["Set-Cookie"]);

        const pingResp = await cassava.testing.testRouter(router, cassava.testing.createTestProxyEvent("/v2/user/ping", "GET", {
            headers: {
                Cookie: `gb_jwt_session=${sessionCookie}; gb_jwt_signature=${signatureCookie}`,
                "X-Requested-With": "XMLHttpRequest"
            }
        }));
        chai.assert.equal(pingResp.statusCode, cassava.httpStatusCode.success.OK);
    });

    it("will not register an invalid email", async () => {
        const registerResp = await router.testUnauthedRequest<any>("/v2/user/register", "POST", {
            email: "notanemail",
            password: generateId()
        });
        chai.assert.equal(registerResp.statusCode, cassava.httpStatusCode.clientError.UNPROCESSABLE_ENTITY);
    });

    it("will not register a user with a short password", async () => {
        const registerResp = await router.testUnauthedRequest<any>("/v2/user/register", "POST", {
            email: "shortpass@example.com",
            password: "1234"
        });
        chai.assert.equal(registerResp.statusCode, cassava.httpStatusCode.clientError.UNPROCESSABLE_ENTITY);
    });

    it("will not verifyEmail with a bad token", async () => {
        const resp = await router.testUnauthedRequest<any>("/v2/user/register/verifyEmail?token=asdfasdfasdf", "GET");
        chai.assert.equal(resp.statusCode, cassava.httpStatusCode.clientError.CONFLICT);
    });
});
