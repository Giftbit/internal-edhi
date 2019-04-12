import * as cassava from "cassava";
import * as chai from "chai";
import * as sinon from "sinon";
import * as testUtils from "../../../utils/testUtils";
import {TestRouter} from "../../../utils/testUtils/TestRouter";
import {installUnauthedRestRoutes} from "../installUnauthedRestRoutes";
import {installAuthedRestRoutes} from "../installAuthedRestRoutes";
import {DbUserLogin} from "../../../db/DbUserLogin";

describe.only("/v2/user/mfa", () => {

    const router = new TestRouter();
    const sinonSandbox = sinon.createSandbox();

    before(async () => {
        await testUtils.resetDb();
        installUnauthedRestRoutes(router);
        router.route(testUtils.authRoute);
        installAuthedRestRoutes(router);
        DbUserLogin.initializeBadgeSigningSecrets(Promise.resolve({secretkey: "secret"}));
    });

    afterEach(async () => {
        sinonSandbox.restore();
        await router.testWebAppRequest("/v2/user/mfa", "DELETE");
    });

    it("returns 404 when no MFA is set", async () => {
        const getMfaResp = await router.testWebAppRequest("/v2/user/mfa", "GET");
        chai.assert.equal(getMfaResp.statusCode, cassava.httpStatusCode.clientError.NOT_FOUND);
    });

    it("needs the correct token to enable MFA", async () => {
        
    });
});
