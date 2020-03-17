import * as cassava from "cassava";
import * as chai from "chai";
import * as crypto from "crypto";
import * as sinon from "sinon";
import * as emailUtils from "../../../utils/emailUtils";
import * as testUtils from "../../../utils/testUtils";
import {generateId} from "../../../utils/testUtils";
import {TestRouter} from "../../../utils/testUtils/TestRouter";
import {installUnauthedRestRoutes} from "../installUnauthedRestRoutes";
import {installAuthedRestRoutes} from "../installAuthedRestRoutes";
import {DbUser} from "../../../db/DbUser";
import {AccountUser} from "../../../model/AccountUser";
import {SwitchableAccount} from "../../../model/SwitchableAccount";
import {Account} from "../../../model/Account";
import {Invitation} from "../../../model/Invitation";
import chaiExclude from "chai-exclude";
import {generateSkewedOtpCode, initializeEncryptionSecret} from "../../../utils/secretsUtils";
import {DbAccountUser} from "../../../db/DbAccountUser";
import {createdDatePast} from "../../../db/dynamodb";
import {LoginResult} from "../../../model/LoginResult";
import {setUserIdTestMode} from "../../../utils/userUtils";
import {ApiKey} from "../../../model/ApiKey";
import {DbUserUniqueness} from "../../../db/DbUserUniqueness";

chai.use(chaiExclude);

describe("/v2/account", () => {

    const router = new TestRouter();
    const sinonSandbox = sinon.createSandbox();

    before(async () => {
        await testUtils.resetDb();
        installUnauthedRestRoutes(router);
        router.route(testUtils.authRoute);
        installAuthedRestRoutes(router);
        DbUser.initializeBadgeSigningSecrets(Promise.resolve({secretkey: "secret"}));
        initializeEncryptionSecret(Promise.resolve(crypto.randomBytes(32).toString("hex")));
    });

    afterEach(async () => {
        sinonSandbox.restore();

        // Reset MFA status.
        await router.testWebAppRequest("/v2/user/mfa", "DELETE");
    });

    it("can get account details", async () => {
        const getAccountResp = await router.testWebAppRequest<Account>("/v2/account", "GET");
        chai.assert.equal(getAccountResp.statusCode, cassava.httpStatusCode.success.OK);
        chai.assert.equal(getAccountResp.body.id, testUtils.defaultTestUser.accountId);
        chai.assert.equal(getAccountResp.body.name, testUtils.defaultTestUser.account.name);
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

        const getSwitchableAccountsResp = await router.testWebAppRequest<SwitchableAccount[]>("/v2/user/accounts", "GET");
        chai.assert.equal(getSwitchableAccountsResp.statusCode, cassava.httpStatusCode.success.OK);
        chai.assert.lengthOf(getSwitchableAccountsResp.body, 1);
        chai.assert.equal(getSwitchableAccountsResp.body[0].accountDisplayName, "Worlds Okayest Account");
    });

    it("can create a brand new account and switch to it", async () => {
        const initialSwitchableAccountsResp = await router.testWebAppRequest<SwitchableAccount[]>("/v2/user/accounts", "GET");
        chai.assert.equal(initialSwitchableAccountsResp.statusCode, cassava.httpStatusCode.success.OK);
        chai.assert.isDefined(initialSwitchableAccountsResp.body.find(a => a.accountId === testUtils.defaultTestUser.account.accountId), `looking for accountId ${testUtils.defaultTestUser.account.accountId} in ${initialSwitchableAccountsResp.bodyRaw}`);

        const createAccountResp = await router.testWebAppRequest<Account>("/v2/account", "POST", {
            name: "Totally Not a Drug Front"
        });
        chai.assert.equal(createAccountResp.statusCode, cassava.httpStatusCode.success.CREATED);
        chai.assert.equal(createAccountResp.body.name, "Totally Not a Drug Front");

        const switchableAccountsResp = await router.testWebAppRequest<SwitchableAccount[]>("/v2/user/accounts", "GET");
        chai.assert.equal(switchableAccountsResp.statusCode, cassava.httpStatusCode.success.OK);
        chai.assert.lengthOf(switchableAccountsResp.body, initialSwitchableAccountsResp.body.length + 1, switchableAccountsResp.bodyRaw);
        chai.assert.isDefined(switchableAccountsResp.body.find(a => a.accountId === createAccountResp.body.id), `looking for accountId ${createAccountResp.body.id} in ${switchableAccountsResp.bodyRaw}`);

        const existingAccount = switchableAccountsResp.body.find(a => a.accountId === testUtils.defaultTestUser.accountId);
        chai.assert.equal(existingAccount.isCurrentAccount, true);

        const createdAccount = switchableAccountsResp.body.find(a => a.accountDisplayName === "Totally Not a Drug Front");
        chai.assert.isDefined(createdAccount, "Find the name of the account created");
        chai.assert.equal(createdAccount.accountId, createAccountResp.body.id);
        chai.assert.equal(createdAccount.isCurrentAccount, false);

        const switchAccountResp = await router.testWebAppRequest<LoginResult>("/v2/account/switch", "POST", {
            accountId: createAccountResp.body.id,
            mode: "test"
        });
        chai.assert.equal(switchAccountResp.statusCode, cassava.httpStatusCode.redirect.FOUND, switchAccountResp.bodyRaw);
        chai.assert.isUndefined(switchAccountResp.body.messageCode);
        chai.assert.isString(switchAccountResp.headers["Location"]);
        chai.assert.isString(switchAccountResp.headers["Set-Cookie"]);

        const getAccountResp = await router.testPostLoginRequest<Account>(switchAccountResp, "/v2/account", "GET");
        chai.assert.equal(getAccountResp.statusCode, cassava.httpStatusCode.success.OK);
        chai.assert.equal(getAccountResp.body.id, createAccountResp.body.id);

        const createdAccountUsersResp = await router.testPostLoginRequest<AccountUser[]>(switchAccountResp, "/v2/account/users", "GET");
        chai.assert.equal(createdAccountUsersResp.statusCode, cassava.httpStatusCode.success.OK);
        chai.assert.lengthOf(createdAccountUsersResp.body, 1, "the only user in this account");
        chai.assert.isAtLeast(createdAccountUsersResp.body[0].roles.length, 1, "has at least 1 role");
    });

    it("can't switch to an account that doesn't exist", async () => {
        const switchAccountResp = await router.testWebAppRequest("/v2/account/switch", "POST", {
            accountId: testUtils.generateId(),
            mode: "test"
        });
        chai.assert.equal(switchAccountResp.statusCode, cassava.httpStatusCode.clientError.FORBIDDEN, switchAccountResp.bodyRaw);
    });

    it("can't switch to an account before accepting an invitation", async () => {
        sinonSandbox.stub(emailUtils, "sendEmail");

        const createAccountResp = await router.testWebAppRequest<Account>("/v2/account", "POST", {
            name: "Totally Not a Drug Front"
        });
        chai.assert.equal(createAccountResp.statusCode, cassava.httpStatusCode.success.CREATED);

        const switchAccountResp = await router.testWebAppRequest("/v2/account/switch", "POST", {
            accountId: createAccountResp.body.id,
            mode: "test"
        });
        chai.assert.equal(switchAccountResp.statusCode, cassava.httpStatusCode.redirect.FOUND, switchAccountResp.bodyRaw);

        const invitationResp = await router.testPostLoginRequest<Invitation>(switchAccountResp, "/v2/account/invitations", "POST", {
            email: testUtils.defaultTestUser.teamMate.email,
            userPrivilegeType: "FULL_ACCESS"
        });
        chai.assert.equal(invitationResp.statusCode, cassava.httpStatusCode.success.CREATED);

        const teamMateSwitchAccountResp = await router.testTeamMateRequest("/v2/account/switch", "POST", {
            accountId: createAccountResp.body.id,
            mode: "test"
        });
        chai.assert.equal(teamMateSwitchAccountResp.statusCode, cassava.httpStatusCode.clientError.FORBIDDEN, teamMateSwitchAccountResp.bodyRaw);
    });

    it("can update an AccountUser's roles and scopes", async () => {
        const getAccountUsersResp = await router.testWebAppRequest<AccountUser>(`/v2/account/users/${testUtils.defaultTestUser.teamMate.userId}`, "GET");
        chai.assert.equal(getAccountUsersResp.statusCode, cassava.httpStatusCode.success.OK);
        chai.assert.isAtLeast(getAccountUsersResp.body.roles.length, 2, "has at least 2 roles");

        const newRoles = [...getAccountUsersResp.body.roles, "AssistantToTheManager"];
        const newScopes = [...getAccountUsersResp.body.scopes, "foobar"];

        const patchAccountUserResp = await router.testWebAppRequest<AccountUser>(`/v2/account/users/${testUtils.defaultTestUser.teamMate.userId}`, "PATCH", {
            roles: newRoles,
            scopes: newScopes
        });
        chai.assert.equal(patchAccountUserResp.statusCode, cassava.httpStatusCode.success.OK);
        chai.assert.deepEqual(patchAccountUserResp.body, {
            ...getAccountUsersResp.body,
            roles: newRoles,
            scopes: newScopes
        });

        const getUpdatedAccountUserResp = await router.testWebAppRequest<AccountUser>(`/v2/account/users/${testUtils.defaultTestUser.teamMate.userId}`, "GET");
        chai.assert.equal(getUpdatedAccountUserResp.statusCode, cassava.httpStatusCode.success.OK);
        chai.assert.deepEqual(getUpdatedAccountUserResp.body, patchAccountUserResp.body);
    });

    it("can remove the user from the account", async () => {
        const newUser = await testUtils.testInviteNewUser(router, sinonSandbox);

        // New account creates an API key.
        const createApiKeyResp = await router.testPostLoginRequest<ApiKey>(newUser.loginResp, "/v2/account/apiKeys", "POST", {
            name: generateId()
        });
        chai.assert.equal(createApiKeyResp.statusCode, cassava.httpStatusCode.success.CREATED);

        const listKeysResp = await router.testApiRequest<ApiKey[]>("/v2/account/apiKeys", "GET");
        chai.assert.equal(listKeysResp.statusCode, cassava.httpStatusCode.success.OK);
        chai.assert.deepEqualExcludingEvery(listKeysResp.body, [createApiKeyResp.body], ["token"]);

        const deleteUserResp = await router.testApiRequest(`/v2/account/users/${newUser.userId}`, "DELETE");
        chai.assert.equal(deleteUserResp.statusCode, cassava.httpStatusCode.success.OK, deleteUserResp.bodyRaw);

        const listKeysAfterDeleteResp = await router.testApiRequest<ApiKey[]>("/v2/account/apiKeys", "GET");
        chai.assert.equal(listKeysAfterDeleteResp.statusCode, cassava.httpStatusCode.success.OK);
        chai.assert.deepEqual(listKeysAfterDeleteResp.body, listKeysResp.body, "deleting the user should not delete their api key");

        const dbUserUniqueness = await DbUserUniqueness.get(newUser.userId);
        chai.assert.isNotNull(dbUserUniqueness, "does not delete the DbUserUniqueness");
        chai.assert.equal(dbUserUniqueness.userId, newUser.userId);

        const dbUser = await DbUser.getById(newUser.userId);
        chai.assert.isNotNull(dbUser, "does not delete the DbUser");
        chai.assert.equal(dbUser.userId, newUser.userId);
        chai.assert.equal(dbUser.email, newUser.email);
    });

    describe("maxInactiveDays (tests are interdependent)", () => {
        it("is null by default", async () => {
            const getAccountResp = await router.testWebAppRequest<Account>("/v2/account", "GET");
            chai.assert.equal(getAccountResp.statusCode, cassava.httpStatusCode.success.OK);
            chai.assert.isNull(getAccountResp.body.maxInactiveDays);
        });

        it("can't be set negative", async () => {
            const patchAccountResp = await router.testWebAppRequest<Account>("/v2/account", "PATCH", {
                maxInactiveDays: -10
            });
            chai.assert.equal(patchAccountResp.statusCode, cassava.httpStatusCode.clientError.UNPROCESSABLE_ENTITY, patchAccountResp.bodyRaw);
        });

        it("can't be set to 0", async () => {
            const patchAccountResp = await router.testWebAppRequest<Account>("/v2/account", "PATCH", {
                maxInactiveDays: 0
            });
            chai.assert.equal(patchAccountResp.statusCode, cassava.httpStatusCode.clientError.UNPROCESSABLE_ENTITY, patchAccountResp.bodyRaw);
        });

        it("can't be set to a crazy high number", async () => {
            const patchAccountResp = await router.testWebAppRequest<Account>("/v2/account", "PATCH", {
                maxInactiveDays: 9999
            });
            chai.assert.equal(patchAccountResp.statusCode, cassava.httpStatusCode.clientError.UNPROCESSABLE_ENTITY, patchAccountResp.bodyRaw);
        });

        it("can be set to a reasonable number", async () => {
            const patchAccountResp = await router.testWebAppRequest<Account>("/v2/account", "PATCH", {
                maxInactiveDays: 180  // a good, recommended value
            });
            chai.assert.equal(patchAccountResp.statusCode, cassava.httpStatusCode.success.OK, patchAccountResp.bodyRaw);
            chai.assert.equal(patchAccountResp.body.maxInactiveDays, 180);

            const getAccountResp = await router.testWebAppRequest<Account>("/v2/account", "GET");
            chai.assert.equal(getAccountResp.statusCode, cassava.httpStatusCode.success.OK);
            chai.assert.equal(getAccountResp.body.maxInactiveDays, 180);
        });

        it("prevents users with inactive accounts from switching", async () => {
            const accountUser = await DbAccountUser.get(testUtils.defaultTestUser.accountId, testUtils.defaultTestUser.userId);
            await DbAccountUser.update(accountUser, {
                action: "put",
                attribute: "lastLoginDate",
                value: createdDatePast(0, 0, 190)
            });

            const switchAccountFailResp = await router.testWebAppRequest<any>("/v2/account/switch", "POST", {
                accountId: testUtils.defaultTestUser.accountId,
                mode: "test"
            });
            chai.assert.equal(switchAccountFailResp.statusCode, cassava.httpStatusCode.redirect.FOUND, switchAccountFailResp.bodyRaw);
            chai.assert.equal(switchAccountFailResp.body.messageCode, "AccountMaxInactiveDays", switchAccountFailResp.bodyRaw);

            const getAccountFailResp = await router.testPostLoginRequest<Account>(switchAccountFailResp, "/v2/account", "GET");
            chai.assert.equal(getAccountFailResp.statusCode, cassava.httpStatusCode.clientError.FORBIDDEN);
        });

        it("prevents users with inactive accounts from logging in", async () => {
            const accountUser = await DbAccountUser.get(testUtils.defaultTestUser.accountId, testUtils.defaultTestUser.userId);
            await DbAccountUser.update(accountUser, {
                action: "put",
                attribute: "lastLoginDate",
                value: createdDatePast(0, 0, 190)
            });

            const loginFailResp = await router.testUnauthedRequest<any>("/v2/user/login", "POST", {
                email: testUtils.defaultTestUser.email,
                password: testUtils.defaultTestUser.password
            });
            chai.assert.equal(loginFailResp.statusCode, cassava.httpStatusCode.redirect.FOUND, loginFailResp.bodyRaw);
            chai.assert.equal(loginFailResp.body.messageCode, "AccountMaxInactiveDays", loginFailResp.bodyRaw);

            const getAccountFailResp = await router.testPostLoginRequest<Account>(loginFailResp, "/v2/account", "GET");
            chai.assert.equal(getAccountFailResp.statusCode, cassava.httpStatusCode.clientError.FORBIDDEN);
        });

        it("does not prevent users with active accounts from switching", async () => {
            const accountUser = await DbAccountUser.get(testUtils.defaultTestUser.accountId, testUtils.defaultTestUser.userId);
            await DbAccountUser.update(accountUser, {
                action: "put",
                attribute: "lastLoginDate",
                value: createdDatePast(0, 0, 4)
            });

            const switchAccountSuccessResp = await router.testWebAppRequest("/v2/account/switch", "POST", {
                accountId: testUtils.defaultTestUser.accountId,
                mode: "test"
            });
            chai.assert.equal(switchAccountSuccessResp.statusCode, cassava.httpStatusCode.redirect.FOUND, switchAccountSuccessResp.bodyRaw);

            const accountUserAfterLogin = await DbAccountUser.get(testUtils.defaultTestUser.accountId, testUtils.defaultTestUser.userId);
            chai.assert.notEqual(accountUserAfterLogin.lastLoginDate, accountUser.lastLoginDate);

            const getAccountSuccessResp = await router.testPostLoginRequest<Account>(switchAccountSuccessResp, "/v2/account", "GET");
            chai.assert.equal(getAccountSuccessResp.statusCode, cassava.httpStatusCode.success.OK);
        });

        it("does not prevent users with active accounts from logging in", async () => {
            const accountUser = await DbAccountUser.get(testUtils.defaultTestUser.accountId, testUtils.defaultTestUser.userId);
            await DbAccountUser.update(accountUser, {
                action: "put",
                attribute: "lastLoginDate",
                value: createdDatePast(0, 0, 4)
            });

            const loginSuccessResp = await router.testUnauthedRequest<LoginResult>("/v2/user/login", "POST", {
                email: testUtils.defaultTestUser.email,
                password: testUtils.defaultTestUser.password
            });
            chai.assert.equal(loginSuccessResp.statusCode, cassava.httpStatusCode.redirect.FOUND);
            chai.assert.isUndefined(loginSuccessResp.body.messageCode);

            const accountUserAfterLogin = await DbAccountUser.get(testUtils.defaultTestUser.accountId, testUtils.defaultTestUser.userId);
            chai.assert.notEqual(accountUserAfterLogin.lastLoginDate, accountUser.lastLoginDate);

            const getAccountSuccessResp = await router.testPostLoginRequest<Account>(loginSuccessResp, "/v2/account", "GET");
            chai.assert.equal(getAccountSuccessResp.statusCode, cassava.httpStatusCode.success.OK);
        });

        it("does not prevent brand new users from logging in", async () => {
            const newUser = await testUtils.testRegisterNewUser(router, sinonSandbox);

            const loginSuccessResp = await router.testUnauthedRequest<LoginResult>("/v2/user/login", "POST", {
                email: newUser.email,
                password: newUser.password
            });
            chai.assert.equal(loginSuccessResp.statusCode, cassava.httpStatusCode.redirect.FOUND);
            chai.assert.isUndefined(loginSuccessResp.body.messageCode);
        });

        it("causes AccountUsers with inactive logins to be listed as such", async () => {
            const accountUser = await DbAccountUser.get(testUtils.defaultTestUser.accountId, testUtils.defaultTestUser.userId);
            await DbAccountUser.update(accountUser, {
                action: "put",
                attribute: "lastLoginDate",
                value: createdDatePast(0, 0, 190)
            });

            const accountUserResp = await router.testWebAppRequest<AccountUser>(`/v2/account/users/${testUtils.defaultTestUser.userId}`, "GET");
            chai.assert.equal(accountUserResp.statusCode, cassava.httpStatusCode.success.OK, accountUserResp.bodyRaw);
            chai.assert.isTrue(accountUserResp.body.lockedByInactivity);

            const otherAccountUserResp = await router.testWebAppRequest<AccountUser>(`/v2/account/users/${testUtils.defaultTestUser.teamMate.userId}`, "GET");
            chai.assert.equal(otherAccountUserResp.statusCode, cassava.httpStatusCode.success.OK, accountUserResp.bodyRaw);
            chai.assert.isFalse(otherAccountUserResp.body.lockedByInactivity);

            const accountUsersResp = await router.testWebAppRequest<AccountUser[]>("/v2/account/users", "GET");
            chai.assert.equal(accountUsersResp.statusCode, cassava.httpStatusCode.success.OK, accountUsersResp.bodyRaw);
            chai.assert.isTrue(accountUsersResp.body.find(user => user.userId === testUtils.defaultTestUser.userId).lockedByInactivity);
            chai.assert.isFalse(accountUsersResp.body.find(user => user.userId === testUtils.defaultTestUser.teamMate.userId).lockedByInactivity);
        });

        it("can lock active users out if lockedByInactivity is PATCHed to true", async () => {
            const accountUser = await DbAccountUser.get(testUtils.defaultTestUser.accountId, testUtils.defaultTestUser.userId);
            await DbAccountUser.update(accountUser, {
                action: "put",
                attribute: "lastLoginDate",
                value: createdDatePast(0, 0, 4)
            });

            const loginSuccessResp = await router.testUnauthedRequest<LoginResult>("/v2/user/login", "POST", {
                email: testUtils.defaultTestUser.email,
                password: testUtils.defaultTestUser.password
            });
            chai.assert.equal(loginSuccessResp.statusCode, cassava.httpStatusCode.redirect.FOUND);
            chai.assert.isUndefined(loginSuccessResp.body.messageCode);

            const patchAccountUserResp = await router.testWebAppRequest<AccountUser>(`/v2/account/users/${testUtils.defaultTestUser.userId}`, "PATCH", {
                lockedByInactivity: true
            });
            chai.assert.equal(patchAccountUserResp.statusCode, cassava.httpStatusCode.success.OK);
            chai.assert.isTrue(patchAccountUserResp.body.lockedByInactivity);

            const loginFailResp = await router.testUnauthedRequest<any>("/v2/user/login", "POST", {
                email: testUtils.defaultTestUser.email,
                password: testUtils.defaultTestUser.password
            });
            chai.assert.equal(loginFailResp.statusCode, cassava.httpStatusCode.redirect.FOUND, loginFailResp.bodyRaw);
            chai.assert.equal(loginFailResp.body.messageCode, "AccountMaxInactiveDays", loginFailResp.bodyRaw);
        });

        it("can allow inactive users back in if lockedByInactivity is PATCHed to false", async () => {
            const accountUser = await DbAccountUser.get(testUtils.defaultTestUser.accountId, testUtils.defaultTestUser.userId);
            await DbAccountUser.update(accountUser, {
                action: "put",
                attribute: "lastLoginDate",
                value: createdDatePast(0, 0, 190)
            });

            const loginFailResp = await router.testUnauthedRequest<any>("/v2/user/login", "POST", {
                email: testUtils.defaultTestUser.email,
                password: testUtils.defaultTestUser.password
            });
            chai.assert.equal(loginFailResp.statusCode, cassava.httpStatusCode.redirect.FOUND, loginFailResp.bodyRaw);
            chai.assert.equal(loginFailResp.body.messageCode, "AccountMaxInactiveDays", loginFailResp.bodyRaw);

            const patchAccountUserResp = await router.testWebAppRequest<AccountUser>(`/v2/account/users/${testUtils.defaultTestUser.userId}`, "PATCH", {
                lockedByInactivity: false
            });
            chai.assert.equal(patchAccountUserResp.statusCode, cassava.httpStatusCode.success.OK);
            chai.assert.isFalse(patchAccountUserResp.body.lockedByInactivity);

            const loginSuccessResp = await router.testUnauthedRequest<LoginResult>("/v2/user/login", "POST", {
                email: testUtils.defaultTestUser.email,
                password: testUtils.defaultTestUser.password
            });
            chai.assert.equal(loginSuccessResp.statusCode, cassava.httpStatusCode.redirect.FOUND);
            chai.assert.isUndefined(loginSuccessResp.body.messageCode);
        });

        it("can be disabled", async () => {
            const patchAccountResp = await router.testWebAppRequest<Account>("/v2/account", "PATCH", {
                maxInactiveDays: null
            });
            chai.assert.equal(patchAccountResp.statusCode, cassava.httpStatusCode.success.OK, patchAccountResp.bodyRaw);
            chai.assert.isNull(patchAccountResp.body.maxInactiveDays);

            const accountUser = await DbAccountUser.get(testUtils.defaultTestUser.accountId, testUtils.defaultTestUser.userId);
            await DbAccountUser.update(accountUser, {
                action: "put",
                attribute: "lastLoginDate",
                value: createdDatePast(1, 0, 0)
            });

            const switchAccountSuccessResp = await router.testWebAppRequest("/v2/account/switch", "POST", {
                accountId: testUtils.defaultTestUser.accountId,
                mode: "test"
            });
            chai.assert.equal(switchAccountSuccessResp.statusCode, cassava.httpStatusCode.redirect.FOUND, switchAccountSuccessResp.bodyRaw);
        });
    });

    describe("maxPasswordAge (tests are interdependent)", () => {

        const defaultTestUserPassword = testUtils.defaultTestUser.user.login.password;

        beforeEach(async () => {
            const expiredLoginDate = new Date(testUtils.defaultTestUser.user.login.password.createdDate);
            expiredLoginDate.setFullYear(expiredLoginDate.getFullYear() - 1);

            const user = await DbUser.get(testUtils.defaultTestUser.email);
            await DbUser.update(user, {
                action: "put",
                attribute: "login.password.createdDate",
                value: expiredLoginDate
            });
        });

        afterEach(async () => {
            const user = await DbUser.get(testUtils.defaultTestUser.email);
            await DbUser.update(user, {
                action: "put",
                attribute: "login.password",
                value: defaultTestUserPassword
            });
        });

        it("is null by default", async () => {
            const getAccountResp = await router.testWebAppRequest<Account>("/v2/account", "GET");
            chai.assert.equal(getAccountResp.statusCode, cassava.httpStatusCode.success.OK);
            chai.assert.isNull(getAccountResp.body.maxPasswordAge);
        });

        it("can't be set negative", async () => {
            const patchAccountResp = await router.testWebAppRequest<Account>("/v2/account", "PATCH", {
                maxPasswordAge: -10
            });
            chai.assert.equal(patchAccountResp.statusCode, cassava.httpStatusCode.clientError.UNPROCESSABLE_ENTITY, patchAccountResp.bodyRaw);
        });

        it("can't be set to 0", async () => {
            const patchAccountResp = await router.testWebAppRequest<Account>("/v2/account", "PATCH", {
                maxPasswordAge: 0
            });
            chai.assert.equal(patchAccountResp.statusCode, cassava.httpStatusCode.clientError.UNPROCESSABLE_ENTITY, patchAccountResp.bodyRaw);
        });

        it("can't be set to a crazy high number", async () => {
            const patchAccountResp = await router.testWebAppRequest<Account>("/v2/account", "PATCH", {
                maxPasswordAge: 9999
            });
            chai.assert.equal(patchAccountResp.statusCode, cassava.httpStatusCode.clientError.UNPROCESSABLE_ENTITY, patchAccountResp.bodyRaw);
        });

        it("can be set to a reasonable number", async () => {
            const patchAccountResp = await router.testWebAppRequest<Account>("/v2/account", "PATCH", {
                maxPasswordAge: 90  // a good, recommended value
            });
            chai.assert.equal(patchAccountResp.statusCode, cassava.httpStatusCode.success.OK, patchAccountResp.bodyRaw);
            chai.assert.equal(patchAccountResp.body.maxPasswordAge, 90);

            const getAccountResp = await router.testWebAppRequest<Account>("/v2/account", "GET");
            chai.assert.equal(getAccountResp.statusCode, cassava.httpStatusCode.success.OK);
            chai.assert.equal(getAccountResp.body.maxPasswordAge, 90);
        });

        it("requires users with passwords older than maxPasswordAge to update their password before switching to the Account", async () => {
            const switchAccountFailResp = await router.testWebAppRequest<any>("/v2/account/switch", "POST", {
                accountId: testUtils.defaultTestUser.accountId,
                mode: "test"
            });
            chai.assert.equal(switchAccountFailResp.statusCode, cassava.httpStatusCode.redirect.FOUND, switchAccountFailResp.bodyRaw);
            chai.assert.equal(switchAccountFailResp.body.messageCode, "AccountMaxPasswordAge", switchAccountFailResp.bodyRaw);

            const getAccountOldPasswordResp = await router.testPostLoginRequest<Account>(switchAccountFailResp, "/v2/account", "GET");
            chai.assert.equal(getAccountOldPasswordResp.statusCode, cassava.httpStatusCode.clientError.FORBIDDEN);

            const changePasswordResp = await router.testWebAppRequest<any>("/v2/user/changePassword", "POST", {
                oldPassword: testUtils.defaultTestUser.password,
                newPassword: generateId()
            });
            chai.assert.equal(changePasswordResp.statusCode, cassava.httpStatusCode.success.OK, changePasswordResp.bodyRaw);

            const switchAccountSuccessResp = await router.testWebAppRequest("/v2/account/switch", "POST", {
                accountId: testUtils.defaultTestUser.accountId,
                mode: "test"
            });
            chai.assert.equal(switchAccountSuccessResp.statusCode, cassava.httpStatusCode.redirect.FOUND, switchAccountSuccessResp.bodyRaw);

            const getAccountSuccessResp = await router.testPostLoginRequest<Account>(switchAccountSuccessResp, "/v2/account", "GET");
            chai.assert.equal(getAccountSuccessResp.statusCode, cassava.httpStatusCode.success.OK);
        });

        it("requires users with passwords older than maxPasswordAge to update their password before logging in to the Account", async () => {
            const loginFailResp = await router.testUnauthedRequest<any>("/v2/user/login", "POST", {
                email: testUtils.defaultTestUser.email,
                password: testUtils.defaultTestUser.password
            });
            chai.assert.equal(loginFailResp.statusCode, cassava.httpStatusCode.redirect.FOUND, loginFailResp.bodyRaw);
            chai.assert.equal(loginFailResp.body.messageCode, "AccountMaxPasswordAge", loginFailResp.bodyRaw);

            const getAccountOldPasswordResp = await router.testPostLoginRequest<Account>(loginFailResp, "/v2/account", "GET");
            chai.assert.equal(getAccountOldPasswordResp.statusCode, cassava.httpStatusCode.clientError.FORBIDDEN);

            const newPassword = generateId();
            const changePasswordResp = await router.testPostLoginRequest<any>(loginFailResp, "/v2/user/changePassword", "POST", {
                oldPassword: testUtils.defaultTestUser.password,
                newPassword: newPassword
            });
            chai.assert.equal(changePasswordResp.statusCode, cassava.httpStatusCode.success.OK, changePasswordResp.bodyRaw);

            const loginSuccessResp = await router.testUnauthedRequest("/v2/user/login", "POST", {
                email: testUtils.defaultTestUser.email,
                password: newPassword
            });
            chai.assert.equal(loginSuccessResp.statusCode, cassava.httpStatusCode.redirect.FOUND);

            const getAccountSuccessResp = await router.testPostLoginRequest<Account>(loginSuccessResp, "/v2/account", "GET");
            chai.assert.equal(getAccountSuccessResp.statusCode, cassava.httpStatusCode.success.OK);
        });

        it("requires existing users newly invited with passwords older than maxPasswordAge update their password", async () => {
            const newUser = await testUtils.testRegisterNewUser(router, sinonSandbox);
            const nedDbUser = await DbUser.get(newUser.email);
            await DbUser.update(nedDbUser, {
                action: "put",
                attribute: "login.password.createdDate",
                value: createdDatePast(1)
            });

            const invite = await testUtils.testInviteExistingUser(newUser.email, router, sinonSandbox);
            chai.assert.equal(invite.acceptInvitationResp.statusCode, cassava.httpStatusCode.redirect.FOUND);
            chai.assert.equal(invite.acceptInvitationResp.body.messageCode, "AccountMaxPasswordAge");

            const getAccountNoMfaResp = await router.testPostLoginRequest<Account>(invite.acceptInvitationResp, "/v2/account", "GET");
            chai.assert.equal(getAccountNoMfaResp.statusCode, cassava.httpStatusCode.clientError.FORBIDDEN);
        });

        it("can be cleared", async () => {
            const patchAccountResp = await router.testWebAppRequest<Account>("/v2/account", "PATCH", {
                maxPasswordAge: null
            });
            chai.assert.equal(patchAccountResp.statusCode, cassava.httpStatusCode.success.OK, patchAccountResp.bodyRaw);
            chai.assert.isNull(patchAccountResp.body.maxPasswordAge);

            const getAccountResp = await router.testWebAppRequest<Account>("/v2/account", "GET");
            chai.assert.equal(getAccountResp.statusCode, cassava.httpStatusCode.success.OK);
            chai.assert.isNull(getAccountResp.body.maxPasswordAge);
        });
    });

    describe("requireMfa (tests are interdependent)", () => {
        it("is false by default", async () => {
            const getAccountResp = await router.testWebAppRequest<Account>("/v2/account", "GET");
            chai.assert.equal(getAccountResp.statusCode, cassava.httpStatusCode.success.OK);
            chai.assert.isFalse(getAccountResp.body.requireMfa);
        });

        it("can be enabled", async () => {
            const patchAccountResp = await router.testWebAppRequest<Account>("/v2/account", "PATCH", {
                requireMfa: true
            });
            chai.assert.equal(patchAccountResp.statusCode, cassava.httpStatusCode.success.OK, patchAccountResp.bodyRaw);
            chai.assert.isTrue(patchAccountResp.body.requireMfa);

            const getAccountResp = await router.testWebAppRequest<Account>("/v2/account", "GET");
            chai.assert.equal(getAccountResp.statusCode, cassava.httpStatusCode.success.OK);
            chai.assert.isTrue(getAccountResp.body.requireMfa);
        });

        it("requires existing users without mfa enabled to do so before switching to the account", async () => {
            const switchAccountNoMfaResp = await router.testWebAppRequest<LoginResult>("/v2/account/switch", "POST", {
                accountId: testUtils.defaultTestUser.accountId,
                mode: "test"
            });
            chai.assert.equal(switchAccountNoMfaResp.statusCode, cassava.httpStatusCode.redirect.FOUND, switchAccountNoMfaResp.bodyRaw);
            chai.assert.equal(switchAccountNoMfaResp.body.hasMfa, false);
            chai.assert.equal(switchAccountNoMfaResp.body.messageCode, "AccountMfaRequired");
            chai.assert.isString(switchAccountNoMfaResp.headers["Location"]);
            chai.assert.isString(switchAccountNoMfaResp.headers["Set-Cookie"]);

            const getAccountNoMfaResp = await router.testPostLoginRequest<Account>(switchAccountNoMfaResp, "/v2/account", "GET");
            chai.assert.equal(getAccountNoMfaResp.statusCode, cassava.httpStatusCode.clientError.FORBIDDEN);

            await testUtils.testEnableTotpMfa(testUtils.defaultTestUser.email);

            const switchAccountWithMfaResp = await router.testWebAppRequest<LoginResult>("/v2/account/switch", "POST", {
                accountId: testUtils.defaultTestUser.account.accountId,
                mode: "test"
            });
            chai.assert.equal(switchAccountWithMfaResp.statusCode, cassava.httpStatusCode.redirect.FOUND, switchAccountWithMfaResp.bodyRaw);
            chai.assert.equal(switchAccountWithMfaResp.body.hasMfa, true);
            chai.assert.notEqual(switchAccountWithMfaResp.body.messageCode, "AccountMfaRequired");
            chai.assert.isString(switchAccountWithMfaResp.headers["Location"]);
            chai.assert.isString(switchAccountWithMfaResp.headers["Set-Cookie"]);

            const getAccountWithMfaResp = await router.testPostLoginRequest<Account>(switchAccountWithMfaResp, "/v2/account", "GET");
            chai.assert.equal(getAccountWithMfaResp.statusCode, cassava.httpStatusCode.success.OK);
        });

        it("requires existing users without mfa enabled to do so before logging into the account", async () => {
            const dbUser = await DbUser.get(testUtils.defaultTestUser.email);
            chai.assert.isNotNull(dbUser);
            chai.assert.equal(dbUser.login.defaultLoginAccountId, setUserIdTestMode(testUtils.defaultTestUser.accountId), "make sure we're logging in to the right account");

            const loginNoMfaResp = await router.testUnauthedRequest<LoginResult>("/v2/user/login", "POST", {
                email: testUtils.defaultTestUser.user.email,
                password: testUtils.defaultTestUser.password
            });
            chai.assert.equal(loginNoMfaResp.statusCode, cassava.httpStatusCode.redirect.FOUND, loginNoMfaResp.bodyRaw);
            chai.assert.equal(loginNoMfaResp.body.hasMfa, false);
            chai.assert.equal(loginNoMfaResp.body.messageCode, "AccountMfaRequired");
            chai.assert.isString(loginNoMfaResp.headers["Location"]);
            chai.assert.isString(loginNoMfaResp.headers["Set-Cookie"]);

            const getAccountNoMfaResp = await router.testPostLoginRequest<Account>(loginNoMfaResp, "/v2/account", "GET");
            chai.assert.equal(getAccountNoMfaResp.statusCode, cassava.httpStatusCode.clientError.FORBIDDEN);

            const totpSecret = await testUtils.testEnableTotpMfa(testUtils.defaultTestUser.email);

            const loginWithMfaResp = await router.testUnauthedRequest<LoginResult>("/v2/user/login", "POST", {
                email: testUtils.defaultTestUser.user.email,
                password: testUtils.defaultTestUser.password
            });
            chai.assert.equal(loginWithMfaResp.statusCode, cassava.httpStatusCode.redirect.FOUND, loginNoMfaResp.bodyRaw);

            const loginWithMfaCompleteResp = await router.testPostLoginRequest<LoginResult>(loginWithMfaResp, "/v2/user/login/mfa", "POST", {
                code: await generateSkewedOtpCode(totpSecret, -2000)
            });
            chai.assert.equal(loginWithMfaCompleteResp.statusCode, cassava.httpStatusCode.redirect.FOUND);
            chai.assert.equal(loginWithMfaCompleteResp.body.hasMfa, true);
            chai.assert.notEqual(loginWithMfaCompleteResp.body.messageCode, "AccountMfaRequired");
            chai.assert.isString(loginWithMfaCompleteResp.headers["Location"]);
            chai.assert.isString(loginWithMfaCompleteResp.headers["Set-Cookie"]);

            const getAccountWithMfaResp = await router.testPostLoginRequest<Account>(loginWithMfaCompleteResp, "/v2/account", "GET");
            chai.assert.equal(getAccountWithMfaResp.statusCode, cassava.httpStatusCode.success.OK);
        });

        it("requires new users to set up mfa as part of gaining access", async () => {
            const newUser = await testUtils.testInviteNewUser(router, sinonSandbox);

            const loginNoMfaResp = await router.testUnauthedRequest<LoginResult>("/v2/user/login", "POST", {
                email: newUser.email,
                password: newUser.password
            });
            chai.assert.equal(loginNoMfaResp.statusCode, cassava.httpStatusCode.redirect.FOUND, loginNoMfaResp.bodyRaw);
            chai.assert.equal(loginNoMfaResp.body.hasMfa, false);
            chai.assert.equal(loginNoMfaResp.body.messageCode, "AccountMfaRequired");
            chai.assert.isString(loginNoMfaResp.headers["Location"]);
            chai.assert.isString(loginNoMfaResp.headers["Set-Cookie"]);

            const getAccountNoMfaResp = await router.testPostLoginRequest<Account>(loginNoMfaResp, "/v2/account", "GET");
            chai.assert.equal(getAccountNoMfaResp.statusCode, cassava.httpStatusCode.clientError.FORBIDDEN);
        });

        it("requires existing users newly invited set up mfa as part of gaining access", async () => {
            const newUser = await testUtils.testRegisterNewUser(router, sinonSandbox);
            const invite = await testUtils.testInviteExistingUser(newUser.email, router, sinonSandbox);
            chai.assert.equal(invite.acceptInvitationResp.statusCode, cassava.httpStatusCode.redirect.FOUND);
            chai.assert.equal(invite.acceptInvitationResp.body.messageCode, "AccountMfaRequired");

            const getAccountNoMfaResp = await router.testPostLoginRequest<Account>(invite.acceptInvitationResp, "/v2/account", "GET");
            chai.assert.equal(getAccountNoMfaResp.statusCode, cassava.httpStatusCode.clientError.FORBIDDEN);
        });

        it("can be disabled", async () => {
            const patchAccountResp = await router.testWebAppRequest<Account>("/v2/account", "PATCH", {
                requireMfa: false
            });
            chai.assert.equal(patchAccountResp.statusCode, cassava.httpStatusCode.success.OK, patchAccountResp.bodyRaw);
            chai.assert.isFalse(patchAccountResp.body.requireMfa);

            await router.testWebAppRequest("/v2/user/mfa", "DELETE");

            const switchAccountNoMfaResp = await router.testWebAppRequest("/v2/account/switch", "POST", {
                accountId: testUtils.defaultTestUser.account.accountId,
                mode: "test"
            });
            chai.assert.equal(switchAccountNoMfaResp.statusCode, cassava.httpStatusCode.redirect.FOUND, switchAccountNoMfaResp.bodyRaw);
            chai.assert.isString(switchAccountNoMfaResp.headers["Location"]);
            chai.assert.isString(switchAccountNoMfaResp.headers["Set-Cookie"]);

            const getAccountWithMfaResp = await router.testPostLoginRequest<Account>(switchAccountNoMfaResp, "/v2/account", "GET");
            chai.assert.equal(getAccountWithMfaResp.statusCode, cassava.httpStatusCode.success.OK);
        });
    });
});
