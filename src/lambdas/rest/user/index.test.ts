import * as chai from "chai";
import * as cassava from "cassava";
import * as crypto from "crypto";
import * as testUtils from "../../../utils/testUtils";
import {TestRouter} from "../../../utils/testUtils/TestRouter";
import {installUnauthedRestRoutes} from "../installUnauthedRestRoutes";
import {installAuthedRestRoutes} from "../installAuthedRestRoutes";
import {User} from "../../../model/User";
import {initializeIntercomSecrets} from "../../../utils/intercomUtils";

describe("/v2/user", () => {

    const intercomTestSecret = "TEST_SECRET";
    const router = new TestRouter();

    before(async () => {
        await testUtils.resetDb();
        installUnauthedRestRoutes(router);
        router.route(testUtils.authRoute);
        installAuthedRestRoutes(router);
        await initializeIntercomSecrets(Promise.resolve({
            secretKey: intercomTestSecret
        }));
    });

    it("can get the current user", async () => {
        const getUserResp = await router.testWebAppRequest<User>("/v2/user", "GET");
        chai.assert.equal(getUserResp.statusCode, cassava.httpStatusCode.success.OK);
        chai.assert.equal(getUserResp.body.email, testUtils.defaultTestUser.email);
        chai.assert.equal(getUserResp.body.id, testUtils.defaultTestUser.userId);
    });

    describe("/v2/user/intercom", () => {
        const testId = testUtils.defaultTestUser.userId.replace("-TEST", "");

        it("gets expected hash", async () => {
            const expectedOutput = crypto.createHmac("sha256", intercomTestSecret)
                .update(testId)
                .digest("hex");

            const resp = await router.testWebAppRequest<{ userHash: string; teamMemberId: string; }>("/v2/user/intercom", "GET");
            chai.assert.equal(resp.statusCode, 200);
            chai.assert.equal(expectedOutput, resp.body.userHash);
            chai.assert.equal(testId, resp.body.teamMemberId);
        });
    });
});
