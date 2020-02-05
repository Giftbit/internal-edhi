import * as cassava from "cassava";
import * as chai from "chai";
import * as testUtils from "../../../utils/testUtils";
import {TestRouter} from "../../../utils/testUtils/TestRouter";
import {installUnauthedRestRoutes} from "../installUnauthedRestRoutes";
import {installAuthedRestRoutes} from "../installAuthedRestRoutes";
import {DbUserLogin} from "../../../db/DbUserLogin";
import chaiExclude from "chai-exclude";
import {AccountUser} from "../../../model/AccountUser";
import {UserAccount} from "../../../model/UserAccount";
import {Account} from "../../../model/Account";

chai.use(chaiExclude);

describe("/v2/account", () => {

    const router = new TestRouter();

    before(async () => {
        await testUtils.resetDb();
        installUnauthedRestRoutes(router);
        router.route(testUtils.authRoute);
        installAuthedRestRoutes(router);
        DbUserLogin.initializeBadgeSigningSecrets(Promise.resolve({secretkey: "secret"}));
    });

    it("can get account details", async () => {
        const getAccoundResp = await router.testWebAppRequest<Account>("/v2/account", "GET");
        chai.assert.equal(getAccoundResp.statusCode, cassava.httpStatusCode.success.OK);
        chai.assert.equal(getAccoundResp.body.accountId, testUtils.defaultTestUser.userId);
        chai.assert.equal(getAccoundResp.body.name, testUtils.defaultTestUser.accountDetails.name);
    });

    it("can update account name", async () => {
        const patchAccountResp = await router.testWebAppRequest<Account>("/v2/account", "PATCH", {
            name: "Worlds Okayest Account"
        });
        chai.assert.equal(patchAccountResp.statusCode, cassava.httpStatusCode.success.OK);
        chai.assert.equal(patchAccountResp.body.name, "Worlds Okayest Account");

        const getAccountResp = await router.testWebAppRequest<Account>("/v2/account", "GET");
        chai.assert.equal(getAccountResp.statusCode, cassava.httpStatusCode.success.OK);
        chai.assert.deepEqual(getAccountResp.body, patchAccountResp.body);

        const getUserAccountsResp = await router.testWebAppRequest<UserAccount[]>("/v2/account/switch", "GET");
        chai.assert.equal(getUserAccountsResp.statusCode, cassava.httpStatusCode.success.OK);
        chai.assert.lengthOf(getUserAccountsResp.body, 1);
        chai.assert.equal(getUserAccountsResp.body[0].displayName, "Worlds Okayest Account");
    });

    it("can create a brand new account and switch to it", async () => {
        const initialUserAccountsResp = await router.testWebAppRequest<UserAccount[]>("/v2/account/switch", "GET");
        chai.assert.equal(initialUserAccountsResp.statusCode, cassava.httpStatusCode.success.OK);

        const createAccountResp = await router.testWebAppRequest<Account>("/v2/account", "POST", {
            name: "Totally Not a Drug Front"
        });
        chai.assert.equal(createAccountResp.statusCode, cassava.httpStatusCode.success.CREATED);
        chai.assert.equal(createAccountResp.body.name, "Totally Not a Drug Front");

        const userAccountsResp = await router.testWebAppRequest<UserAccount[]>("/v2/account/switch", "GET");
        chai.assert.equal(userAccountsResp.statusCode, cassava.httpStatusCode.success.OK);
        chai.assert.lengthOf(userAccountsResp.body, initialUserAccountsResp.body.length + 1, userAccountsResp.bodyRaw);

        const createdUserAccount = userAccountsResp.body.find(a => a.displayName === "Totally Not a Drug Front");
        chai.assert.isDefined(createdUserAccount, "Find the name of the account created");
        chai.assert.equal(createdUserAccount.accountId, createAccountResp.body.accountId);
        chai.assert.equal(createdUserAccount.userId, testUtils.defaultTestUser.teamMemberId);

        const switchAccountResp = await router.testWebAppRequest("/v2/account/switch", "POST", {
            accountId: createAccountResp.body.accountId,
            mode: "test"
        });
        chai.assert.equal(switchAccountResp.statusCode, cassava.httpStatusCode.redirect.FOUND, switchAccountResp.bodyRaw);
        chai.assert.isString(switchAccountResp.headers["Location"]);
        chai.assert.isString(switchAccountResp.headers["Set-Cookie"]);

        const getAccountResp = await router.testPostLoginRequest<Account>(switchAccountResp, "/v2/account", "GET");
        chai.assert.equal(getAccountResp.statusCode, cassava.httpStatusCode.success.OK);
        chai.assert.equal(getAccountResp.body.accountId, createAccountResp.body.accountId);

        const createdAccountUsersResp = await router.testPostLoginRequest<AccountUser[]>(switchAccountResp, "/v2/account/users", "GET");
        chai.assert.equal(createdAccountUsersResp.statusCode, cassava.httpStatusCode.success.OK);
        chai.assert.lengthOf(createdAccountUsersResp.body, 1, "the only user in this account");
        chai.assert.isAtLeast(createdAccountUsersResp.body[0].roles.length, 1, "has at least 1 role");
    });
});
