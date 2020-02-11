import * as cassava from "cassava";
import * as chai from "chai";
import * as testUtils from "../../../utils/testUtils";
import {TestRouter} from "../../../utils/testUtils/TestRouter";
import {installUnauthedRestRoutes} from "../installUnauthedRestRoutes";
import {installAuthedRestRoutes} from "../installAuthedRestRoutes";
import {DbUserLogin} from "../../../db/DbUserLogin";
import {AccountSecurity} from "../../../model/AccountSecurity";
import {Account} from "../../../model/Account";

describe("/v2/account/security", () => {

    const router = new TestRouter();

    before(async () => {
        await testUtils.resetDb();
        installUnauthedRestRoutes(router);
        router.route(testUtils.authRoute);
        installAuthedRestRoutes(router);
        DbUserLogin.initializeBadgeSigningSecrets(Promise.resolve({secretkey: "secret"}));
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

        it("existing users without mfa enabled are required to do so before gaining full access", async () => {
            const switchAccountNoMfaResp = await router.testWebAppRequest("/v2/account/switch", "POST", {
                accountId: testUtils.defaultTestUser.accountDetails.accountId,
                mode: "test"
            });
            chai.assert.equal(switchAccountNoMfaResp.statusCode, cassava.httpStatusCode.redirect.FOUND, switchAccountNoMfaResp.bodyRaw);
            chai.assert.isString(switchAccountNoMfaResp.headers["Location"]);
            chai.assert.isString(switchAccountNoMfaResp.headers["Set-Cookie"]);

            const getAccountNoMfaResp = await router.testPostLoginRequest<Account>(switchAccountNoMfaResp, "/v2/account", "GET");
            chai.assert.equal(getAccountNoMfaResp.statusCode, cassava.httpStatusCode.clientError.FORBIDDEN);

            await testUtils.enableTotpMfa(testUtils.defaultTestUser.email);

            const switchAccountWithMfaResp = await router.testWebAppRequest("/v2/account/switch", "POST", {
                accountId: testUtils.defaultTestUser.accountDetails.accountId,
                mode: "test"
            });
            chai.assert.equal(switchAccountWithMfaResp.statusCode, cassava.httpStatusCode.redirect.FOUND, switchAccountWithMfaResp.bodyRaw);
            chai.assert.isString(switchAccountWithMfaResp.headers["Location"]);
            chai.assert.isString(switchAccountWithMfaResp.headers["Set-Cookie"]);

            const getAccountWithMfaResp = await router.testPostLoginRequest<Account>(switchAccountWithMfaResp, "/v2/account", "GET");
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
