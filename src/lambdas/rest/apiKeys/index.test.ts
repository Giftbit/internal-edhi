import * as cassava from "cassava";
import * as chai from "chai";
import * as giftbitRoutes from "giftbit-cassava-routes";
import * as sinon from "sinon";
import * as testUtils from "../../../utils/testUtils";
import {generateId} from "../../../utils/testUtils";
import {TestRouter} from "../../../utils/testUtils/TestRouter";
import {installUnauthedRestRoutes} from "../installUnauthedRestRoutes";
import {installAuthedRestRoutes} from "../installAuthedRestRoutes";
import {DbUser} from "../../../db/DbUser";
import {ApiKey} from "../../../model/ApiKey";
import chaiExclude from "chai-exclude";
import {LoginResult} from "../../../model/LoginResult";
import {setUserIdTestMode} from "../../../utils/userUtils";

chai.use(chaiExclude);

describe("/v2/account/apiKeys", () => {

    const router = new TestRouter();
    const sinonSandbox = sinon.createSandbox();

    before(async () => {
        await testUtils.resetDb();
        installUnauthedRestRoutes(router);
        router.route(testUtils.authRoute);
        installAuthedRestRoutes(router);
        DbUser.initializeBadgeSigningSecrets(Promise.resolve({secretkey: "secret"}));
    });

    afterEach(() => {
        sinonSandbox.restore();
    });

    it("can create, list, get and delete API keys", async () => {
        const listKeysInitialResp = await router.testApiRequest<ApiKey[]>("/v2/account/apiKeys", "GET");
        chai.assert.equal(listKeysInitialResp.statusCode, cassava.httpStatusCode.success.OK);
        chai.assert.lengthOf(listKeysInitialResp.body, 0);

        const name = generateId();
        const createKeyResp = await router.testApiRequest<ApiKey>("/v2/account/apiKeys", "POST", {
            name: name
        });
        chai.assert.equal(createKeyResp.statusCode, cassava.httpStatusCode.success.CREATED);
        chai.assert.equal(createKeyResp.body.accountId, setUserIdTestMode(testUtils.defaultTestUser.accountId));
        chai.assert.equal(createKeyResp.body.userId, setUserIdTestMode(testUtils.defaultTestUser.userId));
        chai.assert.equal(createKeyResp.body.name, name);
        chai.assert.isString(createKeyResp.body.token);
        chai.assert.isString(createKeyResp.body.createdDate);

        const pingWithApiKeyResp = await router.testApiKeyRequest(createKeyResp.body.token, "/v2/user/ping", "GET");
        chai.assert.equal(pingWithApiKeyResp.statusCode, cassava.httpStatusCode.success.OK);

        const getKeyResp = await router.testApiRequest<ApiKey>(`/v2/account/apiKeys/${createKeyResp.body.tokenId}`, "GET");
        chai.assert.equal(getKeyResp.statusCode, cassava.httpStatusCode.success.OK);
        chai.assert.deepEqualExcluding(getKeyResp.body, createKeyResp.body, ["token"]);
        chai.assert.isUndefined(getKeyResp.body.token);

        const listKeysResp = await router.testApiRequest<ApiKey[]>("/v2/account/apiKeys", "GET");
        chai.assert.equal(listKeysResp.statusCode, cassava.httpStatusCode.success.OK);
        chai.assert.deepEqual(listKeysResp.body, [getKeyResp.body]);

        const deleteKeyResp = await router.testApiRequest<ApiKey>(`/v2/account/apiKeys/${createKeyResp.body.tokenId}`, "DELETE");
        chai.assert.equal(deleteKeyResp.statusCode, cassava.httpStatusCode.success.OK);
        // NOTE: this is where we would check that a call to blacklist the token happens

        const getKeyPostDeleteResp = await router.testApiRequest<ApiKey>(`/v2/account/apiKeys/${createKeyResp.body.tokenId}`, "GET");
        chai.assert.equal(getKeyPostDeleteResp.statusCode, cassava.httpStatusCode.clientError.NOT_FOUND);

        const listKeysPostDeleteResp = await router.testApiRequest<ApiKey[]>("/v2/account/apiKeys", "GET");
        chai.assert.equal(listKeysPostDeleteResp.statusCode, cassava.httpStatusCode.success.OK);
        chai.assert.lengthOf(listKeysPostDeleteResp.body, 0);
    });

    it("lists API keys from test and live separately", async () => {
        const createTestKeyResp = await router.testWebAppRequest<ApiKey>("/v2/account/apiKeys", "POST", {
            name: generateId()
        });
        chai.assert.equal(createTestKeyResp.statusCode, cassava.httpStatusCode.success.CREATED);
        chai.assert.equal(createTestKeyResp.body.userId, setUserIdTestMode(testUtils.defaultTestUser.userId));

        const testKeyJson: giftbitRoutes.jwtauth.JwtPayload = JSON.parse(Buffer.from(createTestKeyResp.body.token.split(".")[1], "base64").toString("ascii"));
        chai.assert.isTrue(giftbitRoutes.jwtauth.JwtPayload.isTestUser(testKeyJson), JSON.stringify(testKeyJson));

        const liveSwitchResp = await router.testWebAppRequest<LoginResult>("/v2/account/switch", "POST", {
            accountId: testUtils.defaultTestUser.accountId,
            mode: "live"
        });
        chai.assert.equal(liveSwitchResp.statusCode, cassava.httpStatusCode.redirect.FOUND, liveSwitchResp.bodyRaw);

        const createLiveKeyResp = await router.testPostLoginRequest<ApiKey>(liveSwitchResp, "/v2/account/apiKeys", "POST", {
            name: generateId()
        });

        const liveKeyJson: giftbitRoutes.jwtauth.JwtPayload = JSON.parse(Buffer.from(createLiveKeyResp.body.token.split(".")[1], "base64").toString("ascii"));
        chai.assert.isFalse(giftbitRoutes.jwtauth.JwtPayload.isTestUser(liveKeyJson), JSON.stringify(liveKeyJson));

        const listTestKeysResp = await router.testWebAppRequest<ApiKey[]>("/v2/account/apiKeys", "GET");
        chai.assert.equal(listTestKeysResp.statusCode, cassava.httpStatusCode.success.OK);
        chai.assert.lengthOf(listTestKeysResp.body, 1, "there is 1 test key");
        chai.assert.deepEqualExcluding(listTestKeysResp.body, [createTestKeyResp.body], ["token"]);

        const listLiveKeysResp = await router.testPostLoginRequest<ApiKey[]>(liveSwitchResp, "/v2/account/apiKeys", "GET");
        chai.assert.equal(listLiveKeysResp.statusCode, cassava.httpStatusCode.success.OK);
        chai.assert.lengthOf(listLiveKeysResp.body, 1, "there is 1 live key");
        chai.assert.deepEqualExcluding(listLiveKeysResp.body, [createLiveKeyResp.body], ["token"]);

        const deleteTestKeyLiveFailResp = await router.testPostLoginRequest<ApiKey>(liveSwitchResp, `/v2/account/apiKeys/${createTestKeyResp.body.tokenId}`, "DELETE");
        chai.assert.equal(deleteTestKeyLiveFailResp.statusCode, cassava.httpStatusCode.clientError.NOT_FOUND, "can't delete the test key with the live token");

        const deleteTestKeyResp = await router.testWebAppRequest<ApiKey>(`/v2/account/apiKeys/${createTestKeyResp.body.tokenId}`, "DELETE");
        chai.assert.equal(deleteTestKeyResp.statusCode, cassava.httpStatusCode.success.OK);

        const deleteLiveKeyTestFailResp = await router.testWebAppRequest<ApiKey>(`/v2/account/apiKeys/${createLiveKeyResp.body.tokenId}`, "DELETE");
        chai.assert.equal(deleteLiveKeyTestFailResp.statusCode, cassava.httpStatusCode.clientError.NOT_FOUND, "can't delete the live key from the test token");

        const deleteLiveKeyResp = await router.testPostLoginRequest<ApiKey>(liveSwitchResp, `/v2/account/apiKeys/${createLiveKeyResp.body.tokenId}`, "DELETE");
        chai.assert.equal(deleteLiveKeyResp.statusCode, cassava.httpStatusCode.success.OK);
    });

    it("can list and delete API keys created by other users", async () => {
        const listKeysInitialResp = await router.testApiRequest<ApiKey[]>("/v2/account/apiKeys", "GET");
        chai.assert.equal(listKeysInitialResp.statusCode, cassava.httpStatusCode.success.OK);
        chai.assert.lengthOf(listKeysInitialResp.body, 0);

        const name = generateId();
        const createKeyResp = await router.testTeamMateRequest<ApiKey>("/v2/account/apiKeys", "POST", {
            name: name
        });
        chai.assert.equal(createKeyResp.statusCode, cassava.httpStatusCode.success.CREATED);
        chai.assert.equal(createKeyResp.body.accountId, setUserIdTestMode(testUtils.defaultTestUser.accountId));
        chai.assert.equal(createKeyResp.body.userId, setUserIdTestMode(testUtils.defaultTestUser.teamMate.userId));
        chai.assert.equal(createKeyResp.body.name, name);
        chai.assert.isString(createKeyResp.body.token);
        chai.assert.isString(createKeyResp.body.createdDate);

        const getKeyResp = await router.testApiRequest<ApiKey>(`/v2/account/apiKeys/${createKeyResp.body.tokenId}`, "GET");
        chai.assert.equal(getKeyResp.statusCode, cassava.httpStatusCode.success.OK);
        chai.assert.deepEqualExcluding(getKeyResp.body, createKeyResp.body, ["token"]);
        chai.assert.isUndefined(getKeyResp.body.token);

        const listKeysResp = await router.testApiRequest<ApiKey[]>("/v2/account/apiKeys", "GET");
        chai.assert.equal(listKeysResp.statusCode, cassava.httpStatusCode.success.OK);
        chai.assert.deepEqual(listKeysResp.body, [getKeyResp.body]);

        const deleteKeyResp = await router.testApiRequest<ApiKey>(`/v2/account/apiKeys/${createKeyResp.body.tokenId}`, "DELETE");
        chai.assert.equal(deleteKeyResp.statusCode, cassava.httpStatusCode.success.OK);
        // NOTE: this is where we would check that a call to blacklist the token happens
    });
});
