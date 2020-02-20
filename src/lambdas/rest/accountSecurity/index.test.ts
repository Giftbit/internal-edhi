import * as cassava from "cassava";
import * as chai from "chai";
import * as crypto from "crypto";
import * as sinon from "sinon";
import * as testUtils from "../../../utils/testUtils";
import {generateId} from "../../../utils/testUtils";
import {TestRouter} from "../../../utils/testUtils/TestRouter";
import {installUnauthedRestRoutes} from "../installUnauthedRestRoutes";
import {installAuthedRestRoutes} from "../installAuthedRestRoutes";
import {DbUserLogin} from "../../../db/DbUserLogin";
import {AccountSecurity} from "../../../model/AccountSecurity";
import {Account} from "../../../model/Account";
import {LoginResult} from "../../../model/LoginResult";
import {setUserIdTestMode} from "../../../utils/userUtils";
import {generateSkewedOtpCode, initializeOtpEncryptionSecrets} from "../../../utils/otpUtils";
import {DbAccountUser} from "../../../db/DbAccountUser";
import {AccountUser} from "../../../model/AccountUser";
import {createdDatePast} from "../../../db/dynamodb";

describe("/v2/account/security", () => {

    const router = new TestRouter();
    const sinonSandbox = sinon.createSandbox();

    before(async () => {
        await testUtils.resetDb();
        installUnauthedRestRoutes(router);
        router.route(testUtils.authRoute);
        installAuthedRestRoutes(router);
        DbUserLogin.initializeBadgeSigningSecrets(Promise.resolve({secretkey: "secret"}));
        initializeOtpEncryptionSecrets(Promise.resolve({key: crypto.randomBytes(32).toString("hex")}));
    });

    afterEach(async () => {
        sinonSandbox.restore();

        // Reset MFA status.
        await router.testWebAppRequest("/v2/user/mfa", "DELETE");
    });

    describe("maxInactiveDays (tests are interdependent)", () => {
        it("is null by default", async () => {
            const getAccountSecurityResp = await router.testWebAppRequest<AccountSecurity>("/v2/account/security", "GET");
            chai.assert.equal(getAccountSecurityResp.statusCode, cassava.httpStatusCode.success.OK);
            chai.assert.isNull(getAccountSecurityResp.body.maxInactiveDays);
        });

        it("can't be set negative", async () => {
            const patchAccountResp = await router.testWebAppRequest<AccountSecurity>("/v2/account/security", "PATCH", {
                maxInactiveDays: -10
            });
            chai.assert.equal(patchAccountResp.statusCode, cassava.httpStatusCode.clientError.UNPROCESSABLE_ENTITY, patchAccountResp.bodyRaw);
        });

        it("can't be set to 0", async () => {
            const patchAccountResp = await router.testWebAppRequest<AccountSecurity>("/v2/account/security", "PATCH", {
                maxInactiveDays: 0
            });
            chai.assert.equal(patchAccountResp.statusCode, cassava.httpStatusCode.clientError.UNPROCESSABLE_ENTITY, patchAccountResp.bodyRaw);
        });

        it("can't be set to a crazy high number", async () => {
            const patchAccountResp = await router.testWebAppRequest<AccountSecurity>("/v2/account/security", "PATCH", {
                maxInactiveDays: 9999
            });
            chai.assert.equal(patchAccountResp.statusCode, cassava.httpStatusCode.clientError.UNPROCESSABLE_ENTITY, patchAccountResp.bodyRaw);
        });

        it("can be set to a reasonable number", async () => {
            const patchAccountResp = await router.testWebAppRequest<AccountSecurity>("/v2/account/security", "PATCH", {
                maxInactiveDays: 180  // a good, recommended value
            });
            chai.assert.equal(patchAccountResp.statusCode, cassava.httpStatusCode.success.OK, patchAccountResp.bodyRaw);
            chai.assert.equal(patchAccountResp.body.maxInactiveDays, 180);

            const getAccountSecurityResp = await router.testWebAppRequest<AccountSecurity>("/v2/account/security", "GET");
            chai.assert.equal(getAccountSecurityResp.statusCode, cassava.httpStatusCode.success.OK);
            chai.assert.equal(getAccountSecurityResp.body.maxInactiveDays, 180);
        });

        it("prevents users with inactive accounts from switching", async () => {
            const inactiveDate = new Date();
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
            const newUser = await testUtils.getNewUser(router, sinonSandbox);

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
            chai.assert.isTrue(accountUserResp.body.lockedOnInactivity);

            const otherAccountUserResp = await router.testWebAppRequest<AccountUser>(`/v2/account/users/${testUtils.defaultTestUser.teamMate.userId}`, "GET");
            chai.assert.equal(otherAccountUserResp.statusCode, cassava.httpStatusCode.success.OK, accountUserResp.bodyRaw);
            chai.assert.isFalse(otherAccountUserResp.body.lockedOnInactivity);

            const accountUsersResp = await router.testWebAppRequest<AccountUser[]>("/v2/account/users", "GET");
            chai.assert.equal(accountUsersResp.statusCode, cassava.httpStatusCode.success.OK, accountUsersResp.bodyRaw);
            chai.assert.isTrue(accountUsersResp.body.find(user => user.userId === testUtils.defaultTestUser.userId).lockedOnInactivity);
            chai.assert.isFalse(accountUsersResp.body.find(user => user.userId === testUtils.defaultTestUser.teamMate.userId).lockedOnInactivity);
        });

        it("can lock active users out if lockedOnInactivity is PATCHed to true", async () => {
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
                lockedOnInactivity: true
            });
            chai.assert.equal(patchAccountUserResp.statusCode, cassava.httpStatusCode.success.OK);
            chai.assert.isTrue(patchAccountUserResp.body.lockedOnInactivity);

            const loginFailResp = await router.testUnauthedRequest<any>("/v2/user/login", "POST", {
                email: testUtils.defaultTestUser.email,
                password: testUtils.defaultTestUser.password
            });
            chai.assert.equal(loginFailResp.statusCode, cassava.httpStatusCode.redirect.FOUND, loginFailResp.bodyRaw);
            chai.assert.equal(loginFailResp.body.messageCode, "AccountMaxInactiveDays", loginFailResp.bodyRaw);
        });

        it("can allow inactive users back in if lockedOnInactivity is PATCHed to false", async () => {
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
                lockedOnInactivity: false
            });
            chai.assert.equal(patchAccountUserResp.statusCode, cassava.httpStatusCode.success.OK);
            chai.assert.isFalse(patchAccountUserResp.body.lockedOnInactivity);

            const loginSuccessResp = await router.testUnauthedRequest<LoginResult>("/v2/user/login", "POST", {
                email: testUtils.defaultTestUser.email,
                password: testUtils.defaultTestUser.password
            });
            chai.assert.equal(loginSuccessResp.statusCode, cassava.httpStatusCode.redirect.FOUND);
            chai.assert.isUndefined(loginSuccessResp.body.messageCode);
        });

        it("can be disabled", async () => {
            const patchAccountResp = await router.testWebAppRequest<AccountSecurity>("/v2/account/security", "PATCH", {
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

        const defaultTestUserPassword = testUtils.defaultTestUser.userLogin.password;

        beforeEach(async () => {
            const expiredLoginDate = new Date(testUtils.defaultTestUser.userLogin.password.createdDate);
            expiredLoginDate.setFullYear(expiredLoginDate.getFullYear() - 1);

            const userLogin = await DbUserLogin.get(testUtils.defaultTestUser.email);
            await DbUserLogin.update(userLogin, {
                action: "put",
                attribute: "password.createdDate",
                value: expiredLoginDate
            });
        });

        afterEach(async () => {
            const userLogin = await DbUserLogin.get(testUtils.defaultTestUser.email);
            await DbUserLogin.update(userLogin, {
                action: "put",
                attribute: "password",
                value: defaultTestUserPassword
            });
        });

        it("is null by default", async () => {
            const getAccountSecurityResp = await router.testWebAppRequest<AccountSecurity>("/v2/account/security", "GET");
            chai.assert.equal(getAccountSecurityResp.statusCode, cassava.httpStatusCode.success.OK);
            chai.assert.isNull(getAccountSecurityResp.body.maxPasswordAge);
        });

        it("can't be set negative", async () => {
            const patchAccountResp = await router.testWebAppRequest<AccountSecurity>("/v2/account/security", "PATCH", {
                maxPasswordAge: -10
            });
            chai.assert.equal(patchAccountResp.statusCode, cassava.httpStatusCode.clientError.UNPROCESSABLE_ENTITY, patchAccountResp.bodyRaw);
        });

        it("can't be set to 0", async () => {
            const patchAccountResp = await router.testWebAppRequest<AccountSecurity>("/v2/account/security", "PATCH", {
                maxPasswordAge: 0
            });
            chai.assert.equal(patchAccountResp.statusCode, cassava.httpStatusCode.clientError.UNPROCESSABLE_ENTITY, patchAccountResp.bodyRaw);
        });

        it("can't be set to a crazy high number", async () => {
            const patchAccountResp = await router.testWebAppRequest<AccountSecurity>("/v2/account/security", "PATCH", {
                maxPasswordAge: 9999
            });
            chai.assert.equal(patchAccountResp.statusCode, cassava.httpStatusCode.clientError.UNPROCESSABLE_ENTITY, patchAccountResp.bodyRaw);
        });

        it("can be set to a reasonable number", async () => {
            const patchAccountResp = await router.testWebAppRequest<AccountSecurity>("/v2/account/security", "PATCH", {
                maxPasswordAge: 90  // a good, recommended value
            });
            chai.assert.equal(patchAccountResp.statusCode, cassava.httpStatusCode.success.OK, patchAccountResp.bodyRaw);
            chai.assert.equal(patchAccountResp.body.maxPasswordAge, 90);

            const getAccountSecurityResp = await router.testWebAppRequest<AccountSecurity>("/v2/account/security", "GET");
            chai.assert.equal(getAccountSecurityResp.statusCode, cassava.httpStatusCode.success.OK);
            chai.assert.equal(getAccountSecurityResp.body.maxPasswordAge, 90);
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

        it("can be cleared", async () => {
            const patchAccountResp = await router.testWebAppRequest<AccountSecurity>("/v2/account/security", "PATCH", {
                maxPasswordAge: null
            });
            chai.assert.equal(patchAccountResp.statusCode, cassava.httpStatusCode.success.OK, patchAccountResp.bodyRaw);
            chai.assert.isNull(patchAccountResp.body.maxPasswordAge);

            const getAccountSecurityResp = await router.testWebAppRequest<AccountSecurity>("/v2/account/security", "GET");
            chai.assert.equal(getAccountSecurityResp.statusCode, cassava.httpStatusCode.success.OK);
            chai.assert.isNull(getAccountSecurityResp.body.maxPasswordAge);
        });
    });

    describe("requireMfa (tests are interdependent)", () => {
        it("is false by default", async () => {
            const getAccountSecurityResp = await router.testWebAppRequest<AccountSecurity>("/v2/account/security", "GET");
            chai.assert.equal(getAccountSecurityResp.statusCode, cassava.httpStatusCode.success.OK);
            chai.assert.isFalse(getAccountSecurityResp.body.requireMfa);
        });

        it("can be enabled", async () => {
            const patchAccountResp = await router.testWebAppRequest<AccountSecurity>("/v2/account/security", "PATCH", {
                requireMfa: true
            });
            chai.assert.equal(patchAccountResp.statusCode, cassava.httpStatusCode.success.OK, patchAccountResp.bodyRaw);
            chai.assert.isTrue(patchAccountResp.body.requireMfa);

            const getAccountSecurityResp = await router.testWebAppRequest<AccountSecurity>("/v2/account/security", "GET");
            chai.assert.equal(getAccountSecurityResp.statusCode, cassava.httpStatusCode.success.OK);
            chai.assert.isTrue(getAccountSecurityResp.body.requireMfa);
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

            await testUtils.enableTotpMfa(testUtils.defaultTestUser.email);

            const switchAccountWithMfaResp = await router.testWebAppRequest<LoginResult>("/v2/account/switch", "POST", {
                accountId: testUtils.defaultTestUser.accountDetails.accountId,
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
            const dbUserLogin = await DbUserLogin.get(testUtils.defaultTestUser.email);
            chai.assert.isNotNull(dbUserLogin);
            chai.assert.equal(dbUserLogin.defaultLoginAccountId, setUserIdTestMode(testUtils.defaultTestUser.accountId), "make sure we're logging in to the right account");

            const loginNoMfaResp = await router.testUnauthedRequest<LoginResult>("/v2/user/login", "POST", {
                email: testUtils.defaultTestUser.userLogin.email,
                password: testUtils.defaultTestUser.password
            });
            chai.assert.equal(loginNoMfaResp.statusCode, cassava.httpStatusCode.redirect.FOUND, loginNoMfaResp.bodyRaw);
            chai.assert.equal(loginNoMfaResp.body.hasMfa, false);
            chai.assert.equal(loginNoMfaResp.body.messageCode, "AccountMfaRequired");
            chai.assert.isString(loginNoMfaResp.headers["Location"]);
            chai.assert.isString(loginNoMfaResp.headers["Set-Cookie"]);

            const getAccountNoMfaResp = await router.testPostLoginRequest<Account>(loginNoMfaResp, "/v2/account", "GET");
            chai.assert.equal(getAccountNoMfaResp.statusCode, cassava.httpStatusCode.clientError.FORBIDDEN);

            const totpSecret = await testUtils.enableTotpMfa(testUtils.defaultTestUser.email);

            const loginWithMfaResp = await router.testUnauthedRequest<LoginResult>("/v2/user/login", "POST", {
                email: testUtils.defaultTestUser.userLogin.email,
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
            const newUser = await testUtils.inviteNewUser(router, sinonSandbox);

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

        it("can be disabled", async () => {
            const patchAccountResp = await router.testWebAppRequest<AccountSecurity>("/v2/account/security", "PATCH", {
                requireMfa: false
            });
            chai.assert.equal(patchAccountResp.statusCode, cassava.httpStatusCode.success.OK, patchAccountResp.bodyRaw);
            chai.assert.isFalse(patchAccountResp.body.requireMfa);

            await router.testWebAppRequest("/v2/user/mfa", "DELETE");

            const switchAccountNoMfaResp = await router.testWebAppRequest("/v2/account/switch", "POST", {
                accountId: testUtils.defaultTestUser.accountDetails.accountId,
                mode: "test"
            });
            chai.assert.equal(switchAccountNoMfaResp.statusCode, cassava.httpStatusCode.redirect.FOUND, switchAccountNoMfaResp.bodyRaw);
            chai.assert.isString(switchAccountNoMfaResp.headers["Location"]);
            chai.assert.isString(switchAccountNoMfaResp.headers["Set-Cookie"]);

            const getAccountWithMfaResp = await router.testPostLoginRequest<Account>(switchAccountNoMfaResp, "/v2/account", "GET");
            chai.assert.equal(getAccountWithMfaResp.statusCode, cassava.httpStatusCode.success.OK);
        });
    });

    describe("requirePasswordHistory (tests are interdependent)", () => {
        it("is false by default", async () => {
            const getAccountSecurityResp = await router.testWebAppRequest<AccountSecurity>("/v2/account/security", "GET");
            chai.assert.equal(getAccountSecurityResp.statusCode, cassava.httpStatusCode.success.OK);
            chai.assert.isFalse(getAccountSecurityResp.body.requirePasswordHistory);
        });

        it("can be enabled", async () => {
            const patchAccountResp = await router.testWebAppRequest<AccountSecurity>("/v2/account/security", "PATCH", {
                requirePasswordHistory: true
            });
            chai.assert.equal(patchAccountResp.statusCode, cassava.httpStatusCode.success.OK, patchAccountResp.bodyRaw);
            chai.assert.isTrue(patchAccountResp.body.requirePasswordHistory);

            const getAccountSecurityResp = await router.testWebAppRequest<AccountSecurity>("/v2/account/security", "GET");
            chai.assert.equal(getAccountSecurityResp.statusCode, cassava.httpStatusCode.success.OK);
            chai.assert.isTrue(getAccountSecurityResp.body.requirePasswordHistory);
        });

        it("requires that users in the Account cannot reuse the last password when changing passwords", async () => {
            const changePasswordResp = await router.testWebAppRequest<any>("/v2/user/changePassword", "POST", {
                oldPassword: testUtils.defaultTestUser.password,
                newPassword: testUtils.defaultTestUser.password
            });
            chai.assert.equal(changePasswordResp.statusCode, cassava.httpStatusCode.clientError.CONFLICT, changePasswordResp.bodyRaw);
            chai.assert.equal(changePasswordResp.body.messageCode, "ReusedPassword");
        });

        const passwords = Array(DbUserLogin.maxPasswordHistoryLength + 1).fill(0).map(() => generateId());
        it("requires that users in the Account cannot reuse a recent password when changing passwords", async () => {
            for (let passwordIx = 0; passwordIx < passwords.length; passwordIx++) {
                const changePasswordResp = await router.testWebAppRequest("/v2/user/changePassword", "POST", {
                    oldPassword: passwordIx === 0 ? testUtils.defaultTestUser.password : passwords[passwordIx - 1],
                    newPassword: passwords[passwordIx]
                });
                chai.assert.equal(changePasswordResp.statusCode, cassava.httpStatusCode.success.OK, `Password ix=${passwordIx} password=${passwords[passwordIx]} should be able to change, response=${changePasswordResp.bodyRaw}`);

                // For all but the last password it should be impossible to change back to the original.
                if (passwordIx < passwords.length - 1) {
                    const changePasswordBackFailResp = await router.testWebAppRequest<any>("/v2/user/changePassword", "POST", {
                        oldPassword: passwords[passwordIx],
                        newPassword: testUtils.defaultTestUser.password
                    });
                    chai.assert.equal(changePasswordBackFailResp.statusCode, cassava.httpStatusCode.clientError.CONFLICT, `Password ix=${passwordIx} should not be changed back to default, response=${changePasswordResp.bodyRaw}`);
                    chai.assert.equal(changePasswordBackFailResp.body.messageCode, "ReusedPassword", `Password ix=${passwordIx} should not be changed back to default, response=${changePasswordResp.bodyRaw}`);
                } else {
                    const changePasswordBackSuccessResp = await router.testWebAppRequest<any>("/v2/user/changePassword", "POST", {
                        oldPassword: passwords[passwordIx],
                        newPassword: testUtils.defaultTestUser.password
                    });
                    chai.assert.equal(changePasswordBackSuccessResp.statusCode, cassava.httpStatusCode.success.OK, `Password ix=${passwordIx} should change back to default, response=${changePasswordResp.bodyRaw}`);
                }
            }
        }).timeout(30000);  // Validating passwords takes a long time and this test does *a lot* of that.

        it("can be disabled", async () => {
            const patchAccountResp = await router.testWebAppRequest<AccountSecurity>("/v2/account/security", "PATCH", {
                requirePasswordHistory: false
            });
            chai.assert.equal(patchAccountResp.statusCode, cassava.httpStatusCode.success.OK, patchAccountResp.bodyRaw);
            chai.assert.isFalse(patchAccountResp.body.requirePasswordHistory);
        });

        it("does not prevent users from reusing passwords after all their Accounts stop requiring it", async () => {
            const changePasswordResp = await router.testWebAppRequest("/v2/user/changePassword", "POST", {
                oldPassword: testUtils.defaultTestUser.password,
                newPassword: testUtils.defaultTestUser.password
            });
            chai.assert.equal(changePasswordResp.statusCode, cassava.httpStatusCode.success.OK, changePasswordResp.bodyRaw);
        });
    });
});
