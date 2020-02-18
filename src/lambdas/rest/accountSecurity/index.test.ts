import * as cassava from "cassava";
import * as chai from "chai";
import * as crypto from "crypto";
import * as testUtils from "../../../utils/testUtils";
import {TestRouter} from "../../../utils/testUtils/TestRouter";
import {installUnauthedRestRoutes} from "../installUnauthedRestRoutes";
import {installAuthedRestRoutes} from "../installAuthedRestRoutes";
import {DbUserLogin} from "../../../db/DbUserLogin";
import {AccountSecurity} from "../../../model/AccountSecurity";
import {Account} from "../../../model/Account";
import {LoginResult} from "../../../model/LoginResult";
import {setUserIdTestMode} from "../../../utils/userUtils";
import {generateSkewedOtpCode, initializeOtpEncryptionSecrets} from "../../../utils/otpUtils";

describe("/v2/account/security", () => {

    const router = new TestRouter();

    before(async () => {
        await testUtils.resetDb();
        installUnauthedRestRoutes(router);
        router.route(testUtils.authRoute);
        installAuthedRestRoutes(router);
        DbUserLogin.initializeBadgeSigningSecrets(Promise.resolve({secretkey: "secret"}));
        initializeOtpEncryptionSecrets(Promise.resolve({key: crypto.randomBytes(32).toString("hex")}));
    });

    afterEach(async () => {
        // Reset MFA status.
        await router.testWebAppRequest("/v2/user/mfa", "DELETE");
    });

    describe("requireMfa (tests are interdependent)", () => {
        it("is false by default", async () => {
            const getAccountSecurityResp = await router.testWebAppRequest<AccountSecurity>("/v2/account/security", "GET");
            chai.assert.equal(getAccountSecurityResp.statusCode, cassava.httpStatusCode.success.OK);
            chai.assert.isFalse(getAccountSecurityResp.body.requireMfa);
        });

        it("can be enabled", async () => {
            const patchAccountResp = await router.testWebAppRequest<AccountSecurity>("/v2/account/security", "PATCH", {
                requireMfa: true
            });
            chai.assert.equal(patchAccountResp.statusCode, cassava.httpStatusCode.success.OK, patchAccountResp.bodyRaw);
            chai.assert.isTrue(patchAccountResp.body.requireMfa);

            const getAccountSecurityResp = await router.testWebAppRequest<AccountSecurity>("/v2/account/security", "GET");
            chai.assert.equal(getAccountSecurityResp.statusCode, cassava.httpStatusCode.success.OK);
            chai.assert.isTrue(getAccountSecurityResp.body.requireMfa);
        });

        it("existing users without mfa enabled are required to do so before switching to the account", async () => {
            const switchAccountNoMfaResp = await router.testWebAppRequest<LoginResult>("/v2/account/switch", "POST", {
                accountId: testUtils.defaultTestUser.accountId,
                mode: "test"
            });
            chai.assert.equal(switchAccountNoMfaResp.statusCode, cassava.httpStatusCode.redirect.FOUND, switchAccountNoMfaResp.bodyRaw);
            chai.assert.equal(switchAccountNoMfaResp.body.hasMfa, false);
            chai.assert.equal(switchAccountNoMfaResp.body.messageCode, "AccountMfaRequired");
            chai.assert.isString(switchAccountNoMfaResp.headers["Location"]);
            chai.assert.isString(switchAccountNoMfaResp.headers["Set-Cookie"]);

            const getAccountNoMfaResp = await router.testPostLoginRequest<Account>(switchAccountNoMfaResp, "/v2/account", "GET");
            chai.assert.equal(getAccountNoMfaResp.statusCode, cassava.httpStatusCode.clientError.FORBIDDEN);

            await testUtils.enableTotpMfa(testUtils.defaultTestUser.email);

            const switchAccountWithMfaResp = await router.testWebAppRequest<LoginResult>("/v2/account/switch", "POST", {
                accountId: testUtils.defaultTestUser.accountDetails.accountId,
                mode: "test"
            });
            chai.assert.equal(switchAccountWithMfaResp.statusCode, cassava.httpStatusCode.redirect.FOUND, switchAccountWithMfaResp.bodyRaw);
            chai.assert.equal(switchAccountWithMfaResp.body.hasMfa, true);
            chai.assert.notEqual(switchAccountWithMfaResp.body.messageCode, "AccountMfaRequired");
            chai.assert.isString(switchAccountWithMfaResp.headers["Location"]);
            chai.assert.isString(switchAccountWithMfaResp.headers["Set-Cookie"]);

            const getAccountWithMfaResp = await router.testPostLoginRequest<Account>(switchAccountWithMfaResp, "/v2/account", "GET");
            chai.assert.equal(getAccountWithMfaResp.statusCode, cassava.httpStatusCode.success.OK);
        });

        it("existing users without mfa enabled are required to do so before logging into the account", async () => {
            const dbUserLogin = await DbUserLogin.get(testUtils.defaultTestUser.email);
            chai.assert.isNotNull(dbUserLogin);
            chai.assert.equal(dbUserLogin.defaultLoginAccountId, setUserIdTestMode(testUtils.defaultTestUser.accountId), "make sure we're logging in to the right account");

            const loginNoMfaResp = await router.testUnauthedRequest<LoginResult>("/v2/user/login", "POST", {
                email: testUtils.defaultTestUser.userLogin.email,
                password: testUtils.defaultTestUser.password
            });
            chai.assert.equal(loginNoMfaResp.statusCode, cassava.httpStatusCode.redirect.FOUND, loginNoMfaResp.bodyRaw);
            chai.assert.equal(loginNoMfaResp.body.hasMfa, false);
            chai.assert.equal(loginNoMfaResp.body.messageCode, "AccountMfaRequired");
            chai.assert.isString(loginNoMfaResp.headers["Location"]);
            chai.assert.isString(loginNoMfaResp.headers["Set-Cookie"]);

            const getAccountNoMfaResp = await router.testPostLoginRequest<Account>(loginNoMfaResp, "/v2/account", "GET");
            chai.assert.equal(getAccountNoMfaResp.statusCode, cassava.httpStatusCode.clientError.FORBIDDEN);

            const totpSecret = await testUtils.enableTotpMfa(testUtils.defaultTestUser.email);

            const loginWithMfaResp = await router.testUnauthedRequest<LoginResult>("/v2/user/login", "POST", {
                email: testUtils.defaultTestUser.userLogin.email,
                password: testUtils.defaultTestUser.password
            });
            chai.assert.equal(loginWithMfaResp.statusCode, cassava.httpStatusCode.redirect.FOUND, loginNoMfaResp.bodyRaw);

            const loginWithMfaCompleteResp = await router.testPostLoginRequest<LoginResult>(loginWithMfaResp, "/v2/user/login/mfa", "POST", {
                code: await generateSkewedOtpCode(totpSecret, -2000)
            });
            chai.assert.equal(loginWithMfaCompleteResp.statusCode, cassava.httpStatusCode.redirect.FOUND);
            chai.assert.equal(loginWithMfaCompleteResp.body.hasMfa, true);
            chai.assert.notEqual(loginWithMfaCompleteResp.body.messageCode, "AccountMfaRequired");
            chai.assert.isString(loginWithMfaCompleteResp.headers["Location"]);
            chai.assert.isString(loginWithMfaCompleteResp.headers["Set-Cookie"]);

            const getAccountWithMfaResp = await router.testPostLoginRequest<Account>(loginWithMfaCompleteResp, "/v2/account", "GET");
            chai.assert.equal(getAccountWithMfaResp.statusCode, cassava.httpStatusCode.success.OK);
        });

        it.skip("new users are required to set up mfa as part of gaining access", async () => {

        });

        it("can be disabled", async () => {
            const patchAccountResp = await router.testWebAppRequest<AccountSecurity>("/v2/account/security", "PATCH", {
                requireMfa: false
            });
            chai.assert.equal(patchAccountResp.statusCode, cassava.httpStatusCode.success.OK, patchAccountResp.bodyRaw);
            chai.assert.isFalse(patchAccountResp.body.requireMfa);

            await router.testWebAppRequest("/v2/user/mfa", "DELETE");

            const switchAccountNoMfaResp = await router.testWebAppRequest("/v2/account/switch", "POST", {
                accountId: testUtils.defaultTestUser.accountDetails.accountId,
                mode: "test"
            });
            chai.assert.equal(switchAccountNoMfaResp.statusCode, cassava.httpStatusCode.redirect.FOUND, switchAccountNoMfaResp.bodyRaw);
            chai.assert.isString(switchAccountNoMfaResp.headers["Location"]);
            chai.assert.isString(switchAccountNoMfaResp.headers["Set-Cookie"]);

            const getAccountWithMfaResp = await router.testPostLoginRequest<Account>(switchAccountNoMfaResp, "/v2/account", "GET");
            chai.assert.equal(getAccountWithMfaResp.statusCode, cassava.httpStatusCode.success.OK);
        });
    });
});
