import * as cassava from "cassava";
import * as chai from "chai";
import * as sinon from "sinon";
import * as emailUtils from "../../../utils/emailUtils";
import * as testUtils from "../../../utils/testUtils";
import {generateId} from "../../../utils/testUtils";
import {TestRouter} from "../../../utils/testUtils/TestRouter";
import {dynamodb, objectDynameh} from "../../../db/dynamodb";
import {installUnauthedRestRoutes} from "../installUnauthedRestRoutes";
import {DbUserLogin} from "../../../db/DbUserLogin";

describe("/v2/user/login", () => {

    const router = new TestRouter();
    const sinonSandbox = sinon.createSandbox();

    before(async () => {
        await testUtils.resetDb();
        installUnauthedRestRoutes(router);
        DbUserLogin.initializeBadgeSigningSecrets(Promise.resolve({secretkey: "secret"}));
    });

    afterEach(() => {
        sinonSandbox.restore();
    });

    it("422s when missing an email", async () => {
        const resp = await router.testUnauthedRequest("/v2/user/login", "POST", {
            password: generateId()
        });
        chai.assert.equal(resp.statusCode, cassava.httpStatusCode.clientError.UNPROCESSABLE_ENTITY);
    });

    it("422s when missing a password", async () => {
        const resp = await router.testUnauthedRequest("/v2/user/login", "POST", {
            email: "user@example.com"
        });
        chai.assert.equal(resp.statusCode, cassava.httpStatusCode.clientError.UNPROCESSABLE_ENTITY);
    });

    it("cannot login with a user who does not exist", async () => {
        const resp = await router.testUnauthedRequest("/v2/user/login", "POST", {
            email: "nonexistant@example.com",
            password: generateId()
        });
        chai.assert.equal(resp.statusCode, cassava.httpStatusCode.clientError.UNAUTHORIZED);
    });

    it("cannot login with a user with the wrong password", async () => {
        const resp = await router.testUnauthedRequest("/v2/user/login", "POST", {
            email: testUtils.defaultTestUser.userLogin.email,
            password: generateId()
        });
        chai.assert.equal(resp.statusCode, cassava.httpStatusCode.clientError.UNAUTHORIZED);
    });

    it("can login the test user", async () => {
        const resp = await router.testUnauthedRequest("/v2/user/login", "POST", {
            email: testUtils.defaultTestUser.userLogin.email,
            password: testUtils.defaultTestUser.password
        });
        chai.assert.equal(resp.statusCode, cassava.httpStatusCode.redirect.FOUND);
        chai.assert.isString(resp.headers["Location"]);
        chai.assert.isString(resp.headers["Set-Cookie"]);
        chai.assert.match(resp.headers["Set-Cookie"], /gb_jwt_session=([^ ;]+)/);
        chai.assert.match(resp.headers["Set-Cookie"], /gb_jwt_signature=([^ ;]+)/);
    });

    it("locks the user for an hour after 10 unsuccessful login attempts", async () => {
        let lockedEmail: string;
        sinonSandbox.stub(emailUtils, "sendEmail")
            .callsFake(async (params: emailUtils.SendEmailParams) => {
                lockedEmail = params.htmlBody;
                return null;
            });

        for (let i = 0; i < 10; i++) {
            const resp = await router.testUnauthedRequest("/v2/user/login", "POST", {
                email: testUtils.defaultTestUser.userLogin.email,
                password: generateId()
            });
            chai.assert.equal(resp.statusCode, cassava.httpStatusCode.clientError.UNAUTHORIZED);
            if (i < 9) {
                chai.assert.isUndefined(lockedEmail, `Did not get locked email on attempt ${i}`);
            } else {
                chai.assert.isString(lockedEmail, "Got locked account warning email after the last attempt.");
                chai.assert.notMatch(lockedEmail, /{{.*}}/, "No unreplaced tokens.");
            }
        }

        const goodPasswordButLockedResp = await router.testUnauthedRequest("/v2/user/login", "POST", {
            email: testUtils.defaultTestUser.userLogin.email,
            password: testUtils.defaultTestUser.password
        });
        chai.assert.equal(goodPasswordButLockedResp.statusCode, cassava.httpStatusCode.clientError.UNAUTHORIZED);

        // Manually move the lockedUntilDate to over an hour ago.
        const pastLockedDate = new Date();
        pastLockedDate.setMinutes(pastLockedDate.getMinutes() - 65);
        const updateLockedDateReq = objectDynameh.requestBuilder.buildUpdateInputFromActions(
            DbUserLogin.getKeys(testUtils.defaultTestUser.userLogin),
            {
                action: "put",
                attribute: "lockedUntilDate",
                value: pastLockedDate.toISOString()
            }
        );
        await dynamodb.updateItem(updateLockedDateReq).promise();

        const goodLoginResp = await router.testUnauthedRequest("/v2/user/login", "POST", {
            email: testUtils.defaultTestUser.userLogin.email,
            password: testUtils.defaultTestUser.password
        });
        chai.assert.equal(goodLoginResp.statusCode, cassava.httpStatusCode.redirect.FOUND);
    });

    it("does not log in a user that hasn't not verified their email address, triggers sending another email", async () => {
        let verifyUrl1: string;
        let verifyUrl2: string;
        sinonSandbox.stub(emailUtils, "sendEmail")
            .onFirstCall()
            .callsFake(async (params: emailUtils.SendEmailParams) => {
                const verifyEmailMatcher = /(https:\/\/[a-z.]+\/v2\/user\/register\/verifyEmail\?token=[a-zA-Z0-9]*)/.exec(params.htmlBody);
                verifyUrl1 = verifyEmailMatcher[1];
                return null;
            })
            .onSecondCall()
            .callsFake(async (params: emailUtils.SendEmailParams) => {
                const verifyEmailMatcher = /(https:\/\/[a-z.]+\/v2\/user\/register\/verifyEmail\?token=[a-zA-Z0-9]*)/.exec(params.htmlBody);
                verifyUrl2 = verifyEmailMatcher[1];
                return null;
            });

        const email = generateId() + "@example.com";
        const password = generateId();
        const registerResp = await router.testUnauthedRequest<any>("/v2/user/register", "POST", {
            email,
            password
        });
        chai.assert.equal(registerResp.statusCode, cassava.httpStatusCode.success.CREATED);
        chai.assert.isString(verifyUrl1, "Found verify url in email body.");
        chai.assert.isUndefined(verifyUrl2, "Second email not sent out yet.");

        const loginResp1 = await router.testUnauthedRequest<any>("/v2/user/login", "POST", {
            email,
            password
        });
        chai.assert.equal(loginResp1.statusCode, cassava.httpStatusCode.clientError.UNAUTHORIZED);
        chai.assert.isString(verifyUrl2, "Found verify url in second email body.");

        const token = /\/v2\/user\/register\/verifyEmail\?token=(.*)/.exec(verifyUrl2)[1];
        const verifyResp = await router.testUnauthedRequest<any>(`/v2/user/register/verifyEmail?token=${token}`, "GET");
        chai.assert.equal(verifyResp.statusCode, cassava.httpStatusCode.redirect.FOUND);
        chai.assert.isString(verifyResp.headers["Location"]);

        const loginResp2 = await router.testUnauthedRequest<any>("/v2/user/login", "POST", {
            email,
            password
        });
        chai.assert.equal(loginResp2.statusCode, cassava.httpStatusCode.redirect.FOUND, loginResp2.bodyRaw);
        chai.assert.isString(loginResp2.headers["Location"]);
        chai.assert.isString(loginResp2.headers["Set-Cookie"]);
        chai.assert.match(loginResp2.headers["Set-Cookie"], /gb_jwt_session=([^ ;]+)/);
        chai.assert.match(loginResp2.headers["Set-Cookie"], /gb_jwt_signature=([^ ;]+)/);
    });

    it("can logout", async () => {
        const resp = await router.testWebAppRequest("/v2/user/logout", "POST");
        chai.assert.equal(resp.statusCode, cassava.httpStatusCode.redirect.FOUND, resp.bodyRaw);
        chai.assert.isString(resp.headers["Location"]);
        chai.assert.isString(resp.headers["Set-Cookie"]);
        chai.assert.match(resp.headers["Set-Cookie"], /gb_jwt_session=([^ ;]*).*Expires=Thu, 01 Jan 1970 00:00:00 GMT/);
        chai.assert.match(resp.headers["Set-Cookie"], /gb_jwt_signature=([^ ;]*).*Expires=Thu, 01 Jan 1970 00:00:00 GMT/);
    });
});
