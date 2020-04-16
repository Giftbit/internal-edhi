import * as cassava from "cassava";
import * as chai from "chai";
import * as testUtils from "../../../utils/testUtils";
import {TestRouter} from "../../../utils/testUtils/TestRouter";
import {installPingRest} from "./index";

describe("/v2/user/ping", () => {

    const router = new TestRouter();

    before(async () => {
        router.route(testUtils.authRoute);
        installPingRest(router);
    });

    it("can ping with a logged in user", async () => {
        const resp = await router.testWebAppRequest("/v2/user/ping", "GET");
        chai.assert.equal(resp.statusCode, cassava.httpStatusCode.success.OK);
    });

    it("cannot ping with an unauthed user", async () => {
        const resp = await router.testUnauthedRequest("/v2/user/ping", "GET");
        chai.assert.equal(resp.statusCode, cassava.httpStatusCode.clientError.UNAUTHORIZED);
    });

    it("can ping without refreshing", async () => {
        const resp = await router.testWebAppRequest("/v2/user/ping?refresh=false", "GET");
        chai.assert.equal(resp.statusCode, cassava.httpStatusCode.success.OK);

        chai.assert.isNotString(resp.getCookie("gb_jwt_session"));
        chai.assert.isNotString(resp.getCookie("gb_jwt_signature"));
    });
});
