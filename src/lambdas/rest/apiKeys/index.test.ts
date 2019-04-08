import * as cassava from "cassava";
import * as chai from "chai";
import * as sinon from "sinon";
import * as testUtils from "../../../utils/testUtils";
import {generateId} from "../../../utils/testUtils";
import {TestRouter} from "../../../utils/testUtils/TestRouter";
import {installUnauthedRestRoutes} from "../installUnauthedRestRoutes";
import {installAuthedRestRoutes} from "../installAuthedRestRoutes";
import {DbUserLogin} from "../../../db/DbUserLogin";
import {ApiKey} from "../../../model/ApiKey";
import chaiExclude from "chai-exclude";

chai.use(chaiExclude);

describe("/v2/user/apiKeys", () => {

    const router = new TestRouter();
    const sinonSandbox = sinon.createSandbox();

    before(async () => {
        await testUtils.resetDb();
        installUnauthedRestRoutes(router);
        router.route(testUtils.authRoute);
        installAuthedRestRoutes(router);
        DbUserLogin.initializeBadgeSigningSecrets(Promise.resolve({secretkey: "secret"}));
    });

    afterEach(() => {
        sinonSandbox.restore();
    });

    it("can create, list, get and delete API keys", async () => {
        const listKeysInitialResp = await router.testApiRequest<ApiKey[]>("/v2/user/apiKeys", "GET");
        chai.assert.equal(listKeysInitialResp.statusCode, cassava.httpStatusCode.success.OK);
        chai.assert.lengthOf(listKeysInitialResp.body, 0);

        const displayName = generateId();
        const createKeyResp = await router.testApiRequest<ApiKey>("/v2/user/apiKeys", "POST", {
            displayName
        });
        chai.assert.equal(createKeyResp.statusCode, cassava.httpStatusCode.success.CREATED);
        chai.assert.equal(createKeyResp.body.userId, testUtils.defaultTestUser.userId);
        chai.assert.equal(createKeyResp.body.teamMemberId, testUtils.defaultTestUser.teamMemberId);
        chai.assert.equal(createKeyResp.body.displayName, displayName);
        chai.assert.isString(createKeyResp.body.token);
        chai.assert.isString(createKeyResp.body.dateCreated);

        const getKeyResp = await router.testApiRequest<ApiKey>(`/v2/user/apiKeys/${createKeyResp.body.tokenId}`, "GET");
        chai.assert.equal(getKeyResp.statusCode, cassava.httpStatusCode.success.OK);
        chai.assert.deepEqualExcluding(getKeyResp.body, createKeyResp.body, ["token"]);
        chai.assert.isUndefined(getKeyResp.body.token);

        const listKeysResp = await router.testApiRequest<ApiKey[]>("/v2/user/apiKeys", "GET");
        chai.assert.equal(listKeysResp.statusCode, cassava.httpStatusCode.success.OK);
        chai.assert.deepEqual(listKeysResp.body, [getKeyResp.body]);

        const deleteKeyResp = await router.testApiRequest<ApiKey>(`/v2/user/apiKeys/${createKeyResp.body.tokenId}`, "DELETE");
        chai.assert.equal(deleteKeyResp.statusCode, cassava.httpStatusCode.success.OK);

        const getKeyPostDeleteResp = await router.testApiRequest<ApiKey>(`/v2/user/apiKeys/${createKeyResp.body.tokenId}`, "GET");
        chai.assert.equal(getKeyPostDeleteResp.statusCode, cassava.httpStatusCode.clientError.NOT_FOUND);

        const listKeysPostDeleteResp = await router.testApiRequest<ApiKey[]>("/v2/user/apiKeys", "GET");
        chai.assert.equal(listKeysPostDeleteResp.statusCode, cassava.httpStatusCode.success.OK);
        chai.assert.lengthOf(listKeysPostDeleteResp.body, 0);
    });

    it("can list and delete API keys created by other users", async () => {
        const listKeysInitialResp = await router.testApiRequest<ApiKey[]>("/v2/user/apiKeys", "GET");
        chai.assert.equal(listKeysInitialResp.statusCode, cassava.httpStatusCode.success.OK);
        chai.assert.lengthOf(listKeysInitialResp.body, 0);

        const displayName = generateId();
        const createKeyResp = await router.testTeamMateRequest<ApiKey>("/v2/user/apiKeys", "POST", {
            displayName
        });
        chai.assert.equal(createKeyResp.statusCode, cassava.httpStatusCode.success.CREATED);
        chai.assert.equal(createKeyResp.body.userId, testUtils.defaultTestUser.userId);
        chai.assert.equal(createKeyResp.body.teamMemberId, testUtils.defaultTestUser.teamMate.teamMemberId);
        chai.assert.equal(createKeyResp.body.displayName, displayName);
        chai.assert.isString(createKeyResp.body.token);
        chai.assert.isString(createKeyResp.body.dateCreated);

        const getKeyResp = await router.testApiRequest<ApiKey>(`/v2/user/apiKeys/${createKeyResp.body.tokenId}`, "GET");
        chai.assert.equal(getKeyResp.statusCode, cassava.httpStatusCode.success.OK);
        chai.assert.deepEqualExcluding(getKeyResp.body, createKeyResp.body, ["token"]);
        chai.assert.isUndefined(getKeyResp.body.token);

        const listKeysResp = await router.testApiRequest<ApiKey[]>("/v2/user/apiKeys", "GET");
        chai.assert.equal(listKeysResp.statusCode, cassava.httpStatusCode.success.OK);
        chai.assert.deepEqual(listKeysResp.body, [getKeyResp.body]);

        const deleteKeyResp = await router.testApiRequest<ApiKey>(`/v2/user/apiKeys/${createKeyResp.body.tokenId}`, "DELETE");
        chai.assert.equal(deleteKeyResp.statusCode, cassava.httpStatusCode.success.OK);
    });
});
