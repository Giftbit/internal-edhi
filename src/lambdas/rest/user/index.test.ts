import * as chai from "chai";
import * as cassava from "cassava";
import * as crypto from "crypto";
import * as testUtils from "../../../utils/testUtils";
import {TestRouter} from "../../../utils/testUtils/TestRouter";
import {installUnauthedRestRoutes} from "../installUnauthedRestRoutes";
import {installAuthedRestRoutes} from "../installAuthedRestRoutes";
import {User} from "../../../model/User";
import {initializeIntercomSecrets} from "../../../utils/intercomUtils";
import {SwitchableAccount} from "../../../model/SwitchableAccount";
import {LoginResult} from "../../../model/LoginResult";
import {DbUser} from "../../../db/DbUser";
import {initializeEncryptionSecret} from "../../../utils/secretsUtils";

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
        DbUser.initializeBadgeSigningSecrets(Promise.resolve({secretkey: "secret"}));
        initializeEncryptionSecret(Promise.resolve(crypto.randomBytes(32).toString("hex")));
    });

    it("can get the current user", async () => {
        const getUserResp = await router.testWebAppRequest<User>("/v2/user", "GET");
        chai.assert.equal(getUserResp.statusCode, cassava.httpStatusCode.success.OK);
        chai.assert.equal(getUserResp.body.email, testUtils.defaultTestUser.email);
        chai.assert.equal(getUserResp.body.id, testUtils.defaultTestUser.userId);
        chai.assert.equal(getUserResp.body.mode, "test");
        chai.assert.equal(getUserResp.body.additionalAuthenticationRequired, false);
    });

    it("can get the current user in the middle of mfa login", async () => {
        await testUtils.testEnableTotpMfa(testUtils.defaultTestUser.email);

        const loginResp = await router.testUnauthedRequest<LoginResult>("/v2/user/login", "POST", {
            email: testUtils.defaultTestUser.email,
            password: testUtils.defaultTestUser.password
        });
        chai.assert.equal(loginResp.statusCode, cassava.httpStatusCode.success.OK);
        chai.assert.equal(loginResp.body.messageCode, "MfaAuthRequired");

        const getUserResp = await router.testPostLoginRequest<User>(loginResp, "/v2/user", "GET");
        chai.assert.equal(getUserResp.statusCode, cassava.httpStatusCode.success.OK);
        chai.assert.equal(getUserResp.body.email, testUtils.defaultTestUser.email);
        chai.assert.equal(getUserResp.body.id, testUtils.defaultTestUser.userId);
        chai.assert.equal(getUserResp.body.additionalAuthenticationRequired, true);
    });

    describe("/v2/user/accounts", () => {
        it("lists Accounts the user can switch to (SwitchableAccounts)", async () => {
            const resp = await router.testWebAppRequest<SwitchableAccount[]>("/v2/user/accounts", "GET");
            chai.assert.lengthOf(resp.body, 1);
            chai.assert.equal(resp.body[0].accountId, testUtils.defaultTestUser.accountId);
            chai.assert.equal(resp.body[0].isCurrentAccount, true);
        });
    });

    describe("/v2/user/intercom", () => {
        const testId = testUtils.defaultTestUser.userId.replace("-TEST", "");

        it("gets expected hash", async () => {
            const expectedOutput = crypto.createHmac("sha256", intercomTestSecret)
                .update(testId)
                .digest("hex");

            const resp = await router.testWebAppRequest<{ userHash: string, teamMemberId: string }>("/v2/user/intercom", "GET");
            chai.assert.equal(resp.statusCode, 200);
            chai.assert.equal(expectedOutput, resp.body.userHash);
            chai.assert.equal(testId, resp.body.teamMemberId);
        });
    });
});
