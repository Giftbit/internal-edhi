import * as cassava from "cassava";
import * as chai from "chai";
import * as testUtils from "../../../utils/testUtils";
import {TestRouter} from "../../../utils/testUtils/TestRouter";
import {installLoginRest} from "./index";
import {generateId} from "../../../utils/testUtils";

describe("/v2/user/login", () => {

    const router = new TestRouter();

    before(async () => {
        await testUtils.resetDb();
        installLoginRest(router);
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
});
