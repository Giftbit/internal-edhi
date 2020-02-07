import * as cassava from "cassava";
import * as chai from "chai";
import * as testUtils from "../../../utils/testUtils";
import {TestRouter} from "../../../utils/testUtils/TestRouter";
import {installUnauthedRestRoutes} from "../installUnauthedRestRoutes";
import {installAuthedRestRoutes} from "../installAuthedRestRoutes";
import {DbUserLogin} from "../../../db/DbUserLogin";
import {AccountSecurity} from "../../../model/AccountSecurity";

describe.only("/v2/account/security", () => {

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

        it.skip("existing users without mfa enabled are required to do so before gaining full access", async () => {

        });

        it.skip("existing users without mfa enabled are required to do so before gaining full access", async () => {

        });

        it.skip("new users are required to set up mfa as part of gaining access", async () => {

        });

        it.skip("existing users with mfa enabled are unaffected", async () => {

        });

        it.skip("can be disabled", async () => {

        });
    });
});
