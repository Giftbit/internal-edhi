import * as chai from "chai";
import * as cassava from "cassava";
import * as testUtils from "../../../utils/testUtils";
import {TestRouter} from "../../../utils/testUtils/TestRouter";
import {installUnauthedRestRoutes} from "../installUnauthedRestRoutes";
import {installAuthedRestRoutes} from "../installAuthedRestRoutes";
import {User} from "../../../model/User";

describe("/v2/user", () => {

    const router = new TestRouter();

    before(async () => {
        await testUtils.resetDb();
        installUnauthedRestRoutes(router);
        router.route(testUtils.authRoute);
        installAuthedRestRoutes(router);
    });

    it("can get the current user", async () => {
        const getUserResp = await router.testWebAppRequest<User>("/v2/user", "GET");
        chai.assert.equal(getUserResp.statusCode, cassava.httpStatusCode.success.OK);
        chai.assert.equal(getUserResp.body.email, testUtils.defaultTestUser.email);
        chai.assert.equal(getUserResp.body.id, testUtils.defaultTestUser.userId);
    });
});
