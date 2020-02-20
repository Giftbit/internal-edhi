import * as cassava from "cassava";
import * as chai from "chai";
import * as sinon from "sinon";
import * as emailUtils from "../../../utils/emailUtils";
import * as testUtils from "../../../utils/testUtils";
import {generateId} from "../../../utils/testUtils";
import {TestRouter} from "../../../utils/testUtils/TestRouter";
import {installUnauthedRestRoutes} from "../installUnauthedRestRoutes";
import {installAuthedRestRoutes} from "../installAuthedRestRoutes";
import {Invitation} from "../../../model/Invitation";
import {DbUserLogin} from "../../../db/DbUserLogin";
import {ApiKey} from "../../../model/ApiKey";
import chaiExclude from "chai-exclude";
import {AccountUser} from "../../../model/AccountUser";
import {UserAccount} from "../../../model/UserAccount";
import {Account} from "../../../model/Account";

chai.use(chaiExclude);

describe("/v2/account/invitations", () => {

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

    it("can invite a brand new user, list it, get it, accept it, not delete it after acceptance", async () => {
        let inviteEmail: emailUtils.SendEmailParams;
        sinonSandbox.stub(emailUtils, "sendEmail")
            .callsFake(async (params: emailUtils.SendEmailParams) => {
                inviteEmail = params;
                return null;
            });

        const email = testUtils.generateId() + "@example.com";
        const inviteResp = await router.testApiRequest<Invitation>("/v2/account/invitations", "POST", {
            email: email,
            userPrivilegeType: "FULL_ACCESS"
        });
        chai.assert.equal(inviteResp.statusCode, cassava.httpStatusCode.success.CREATED);
        chai.assert.equal(inviteResp.body.accountId, testUtils.defaultTestUser.accountId);
        chai.assert.equal(inviteResp.body.email, email);
        chai.assert.isObject(inviteEmail, "invite email sent");
        chai.assert.equal(inviteEmail.toAddress, email);
        chai.assert.notMatch(inviteEmail.htmlBody, /{{.*}}/, "No unreplaced tokens.");

        const listInvitationsResp = await router.testApiRequest<Invitation[]>("/v2/account/invitations", "GET");
        chai.assert.equal(listInvitationsResp.statusCode, cassava.httpStatusCode.success.OK);
        chai.assert.deepEqual(listInvitationsResp.body, [inviteResp.body]);

        const getInvitationResp = await router.testApiRequest<Invitation>(`/v2/account/invitations/${inviteResp.body.userId}`, "GET");
        chai.assert.equal(getInvitationResp.statusCode, cassava.httpStatusCode.success.OK);
        chai.assert.deepEqual(getInvitationResp.body, inviteResp.body);

        const acceptInviteToken = /https:\/\/[a-z.]+\/v2\/user\/register\/acceptInvite\?token=([a-zA-Z0-9]*)/.exec(inviteEmail.htmlBody)[1];
        chai.assert.isString(acceptInviteToken);

        const acceptInviteResp = await router.testUnauthedRequest(`/v2/user/register/acceptInvite?token=${acceptInviteToken}`, "GET");
        chai.assert.equal(acceptInviteResp.statusCode, cassava.httpStatusCode.redirect.FOUND, acceptInviteResp.bodyRaw);
        chai.assert.isString(acceptInviteResp.headers["Location"]);
        chai.assert.match(acceptInviteResp.headers["Location"], /https:\/\/.*resetPassword\?token=[a-zA-Z0-9]*/);

        const resetPasswordToken = /https:\/\/.*resetPassword\?token=([a-zA-Z0-9]*)/.exec(acceptInviteResp.headers["Location"])[1];
        chai.assert.isString(resetPasswordToken);

        const password = generateId();
        const completeResp = await router.testUnauthedRequest<any>(`/v2/user/forgotPassword/complete`, "POST", {
            token: resetPasswordToken,
            password
        });
        chai.assert.equal(completeResp.statusCode, cassava.httpStatusCode.redirect.FOUND);
        chai.assert.isString(completeResp.headers["Location"]);

        const loginResp = await router.testUnauthedRequest<any>("/v2/user/login", "POST", {
            email,
            password
        });
        chai.assert.equal(loginResp.statusCode, cassava.httpStatusCode.redirect.FOUND);
        chai.assert.isString(loginResp.headers["Location"]);
        chai.assert.isString(loginResp.headers["Set-Cookie"]);
        chai.assert.match(loginResp.headers["Set-Cookie"], /gb_jwt_session=([^ ;]+)/);
        chai.assert.match(loginResp.headers["Set-Cookie"], /gb_jwt_signature=([^ ;]+)/);

        const pingResp = await router.testPostLoginRequest(loginResp, "/v2/user/ping", "GET");
        chai.assert.equal(pingResp.statusCode, cassava.httpStatusCode.success.OK, JSON.stringify(pingResp.body));

        const cantDeleteInvitationResp = await router.testApiRequest<Invitation>(`/v2/account/invitations/${inviteResp.body.userId}`, "DELETE");
        chai.assert.equal(cantDeleteInvitationResp.statusCode, cassava.httpStatusCode.clientError.CONFLICT);
    });

    it("can resend an invitation without canceling it", async () => {
        let firstInviteEmail: emailUtils.SendEmailParams;
        let reinviteEmail: emailUtils.SendEmailParams;
        sinonSandbox.stub(emailUtils, "sendEmail")
            .onFirstCall()
            .callsFake(async (params: emailUtils.SendEmailParams) => {
                firstInviteEmail = params;
                return null;
            })
            .onSecondCall()
            .callsFake(async (params: emailUtils.SendEmailParams) => {
                reinviteEmail = params;
                return null;
            });

        const email = testUtils.generateId() + "@example.com";
        const inviteResp = await router.testApiRequest<Invitation>("/v2/account/invitations", "POST", {
            email: email,
            userPrivilegeType: "FULL_ACCESS"
        });
        chai.assert.equal(inviteResp.statusCode, cassava.httpStatusCode.success.CREATED);
        chai.assert.isDefined(firstInviteEmail);
        chai.assert.isUndefined(reinviteEmail);

        const reinviteResp = await router.testApiRequest<Invitation>("/v2/account/invitations", "POST", {
            email: email,
            userPrivilegeType: "FULL_ACCESS"
        });
        chai.assert.equal(reinviteResp.statusCode, cassava.httpStatusCode.success.CREATED);
        chai.assert.isDefined(reinviteEmail);

        const acceptInviteLink = /(https:\/\/[a-z.]+\/v2\/user\/register\/acceptInvite\?token=[a-zA-Z0-9]*)/.exec(firstInviteEmail.htmlBody)[1];
        chai.assert.isString(acceptInviteLink);

        const acceptInviteToken = /\?token=([a-zA-Z0-9]*)/.exec(acceptInviteLink)[1];
        chai.assert.isString(acceptInviteToken);

        const acceptInviteResp = await router.testUnauthedRequest(`/v2/user/register/acceptInvite?token=${acceptInviteToken}`, "GET");
        chai.assert.equal(acceptInviteResp.statusCode, cassava.httpStatusCode.redirect.FOUND, acceptInviteResp.bodyRaw);
        chai.assert.isString(acceptInviteResp.headers["Location"]);
        chai.assert.match(acceptInviteResp.headers["Location"], /https:\/\/.*resetPassword\?token=[a-zA-Z0-9]*/);
    });

    it("can cancel an invitation and then resend it", async () => {
        let firstInviteEmail: emailUtils.SendEmailParams;
        let reinviteEmail: emailUtils.SendEmailParams;
        sinonSandbox.stub(emailUtils, "sendEmail")
            .onFirstCall()
            .callsFake(async (params: emailUtils.SendEmailParams) => {
                firstInviteEmail = params;
                return null;
            })
            .onSecondCall()
            .callsFake(async (params: emailUtils.SendEmailParams) => {
                reinviteEmail = params;
                return null;
            });

        const email = testUtils.generateId() + "@example.com";
        const inviteResp = await router.testApiRequest<Invitation>("/v2/account/invitations", "POST", {
            email: email,
            userPrivilegeType: "FULL_ACCESS"
        });
        chai.assert.equal(inviteResp.statusCode, cassava.httpStatusCode.success.CREATED);
        chai.assert.equal(inviteResp.body.accountId, testUtils.defaultTestUser.accountId);
        chai.assert.equal(inviteResp.body.email, email);

        const listInvitationsResp = await router.testApiRequest<Invitation[]>("/v2/account/invitations", "GET");
        chai.assert.equal(listInvitationsResp.statusCode, cassava.httpStatusCode.success.OK);
        chai.assert.deepEqual(listInvitationsResp.body, [inviteResp.body]);

        const deleteInvitationResp = await router.testApiRequest<Invitation>(`/v2/account/invitations/${inviteResp.body.userId}`, "DELETE");
        chai.assert.equal(deleteInvitationResp.statusCode, cassava.httpStatusCode.success.OK);

        const acceptInviteToken = /https:\/\/[a-z.]+\/v2\/user\/register\/acceptInvite\?token=([a-zA-Z0-9]*)/.exec(firstInviteEmail.htmlBody)[1];
        chai.assert.isString(acceptInviteToken);

        const acceptInviteResp = await router.testUnauthedRequest(`/v2/user/register/acceptInvite?token=${acceptInviteToken}`, "GET");
        chai.assert.equal(acceptInviteResp.statusCode, cassava.httpStatusCode.clientError.NOT_FOUND, acceptInviteResp.bodyRaw);

        const reinviteResp = await router.testApiRequest<Invitation>("/v2/account/invitations", "POST", {
            email: email,
            userPrivilegeType: "FULL_ACCESS"
        });
        chai.assert.equal(reinviteResp.statusCode, cassava.httpStatusCode.success.CREATED);
        chai.assert.equal(reinviteResp.body.accountId, testUtils.defaultTestUser.accountId);
        chai.assert.equal(reinviteResp.body.email, email);

        const acceptReinviteToken = /https:\/\/[a-z.]+\/v2\/user\/register\/acceptInvite\?token=([a-zA-Z0-9]*)/.exec(reinviteEmail.htmlBody)[1];
        chai.assert.isString(acceptReinviteToken);
        chai.assert.notEqual(acceptReinviteToken, acceptInviteToken);

        const acceptReinviteResp = await router.testUnauthedRequest(`/v2/user/register/acceptInvite?token=${acceptReinviteToken}`, "GET");
        chai.assert.equal(acceptReinviteResp.statusCode, cassava.httpStatusCode.redirect.FOUND, acceptReinviteResp.bodyRaw);
        chai.assert.isString(acceptReinviteResp.headers["Location"]);
        chai.assert.match(acceptReinviteResp.headers["Location"], /https:\/\/.*resetPassword\?token=[a-zA-Z0-9]*/);

        const resetPasswordToken = /https:\/\/.*resetPassword\?token=([a-zA-Z0-9]*)/.exec(acceptReinviteResp.headers["Location"])[1];
        chai.assert.isString(resetPasswordToken);

        const password = generateId();
        const completeResp = await router.testUnauthedRequest<any>(`/v2/user/forgotPassword/complete`, "POST", {
            token: resetPasswordToken,
            password
        });
        chai.assert.equal(completeResp.statusCode, cassava.httpStatusCode.redirect.FOUND);
        chai.assert.isString(completeResp.headers["Location"]);
    });

    it("can invite a user to an account that already has its own account", async () => {
        // Reset the DB because we're going to count users.
        await testUtils.resetDb();

        // Set up a new account.
        let verifyEmail: emailUtils.SendEmailParams;
        let inviteEmail: emailUtils.SendEmailParams;
        sinonSandbox.stub(emailUtils, "sendEmail")
            .onFirstCall()
            .callsFake(async (params: emailUtils.SendEmailParams) => {
                verifyEmail = params;
                return null;
            })
            .onSecondCall()
            .callsFake(async (params: emailUtils.SendEmailParams) => {
                inviteEmail = params;
                return null;
            });

        const email = generateId() + "@example.com";
        const password = generateId();
        const registerResp = await router.testUnauthedRequest<any>("/v2/user/register", "POST", {
            email: email,
            password: password
        });
        chai.assert.equal(registerResp.statusCode, cassava.httpStatusCode.success.CREATED);

        const token = /https:\/\/[a-z.]+\/v2\/user\/register\/verifyEmail\?token=([a-zA-Z0-9]*)/.exec(verifyEmail.htmlBody)[1];
        const verifyResp = await router.testUnauthedRequest<any>(`/v2/user/register/verifyEmail?token=${token}`, "GET");
        chai.assert.equal(verifyResp.statusCode, cassava.httpStatusCode.redirect.FOUND, verifyResp.bodyRaw);
        chai.assert.isString(verifyResp.headers["Location"]);

        const loginResp = await router.testUnauthedRequest<any>("/v2/user/login", "POST", {
            email: email,
            password: password
        });
        chai.assert.equal(loginResp.statusCode, cassava.httpStatusCode.redirect.FOUND);

        const firstAccountUsersResp = await router.testPostLoginRequest<AccountUser[]>(loginResp, "/v2/account/users", "GET");
        chai.assert.equal(firstAccountUsersResp.statusCode, cassava.httpStatusCode.success.OK);
        chai.assert.lengthOf(firstAccountUsersResp.body, 1);

        // Default test user invites the new user to their account.
        const inviteResp = await router.testApiRequest<Invitation>("/v2/account/invitations", "POST", {
            email: email,
            userPrivilegeType: "FULL_ACCESS"
        });
        chai.assert.equal(inviteResp.statusCode, cassava.httpStatusCode.success.CREATED);
        chai.assert.equal(inviteResp.body.accountId, testUtils.defaultTestUser.accountId);
        chai.assert.equal(inviteResp.body.email, email);

        const acceptInviteToken = /https:\/\/[a-z.]+\/v2\/user\/register\/acceptInvite\?token=([a-zA-Z0-9]*)/.exec(inviteEmail.htmlBody)[1];
        chai.assert.isString(acceptInviteToken);

        const acceptInviteResp = await router.testUnauthedRequest(`/v2/user/register/acceptInvite?token=${acceptInviteToken}`, "GET");
        chai.assert.equal(acceptInviteResp.statusCode, cassava.httpStatusCode.redirect.FOUND, acceptInviteResp.bodyRaw);
        chai.assert.isString(acceptInviteResp.headers["Location"]);

        const listAccountsResp = await router.testPostLoginRequest<UserAccount[]>(loginResp, "/v2/account/switch", "GET");
        chai.assert.lengthOf(listAccountsResp.body, 2);
        chai.assert.isDefined(listAccountsResp.body.find(tm => tm.accountId !== testUtils.defaultTestUser.accountId), listAccountsResp.bodyRaw);
        chai.assert.isDefined(listAccountsResp.body.find(tm => tm.accountId === testUtils.defaultTestUser.accountId), listAccountsResp.bodyRaw);

        const switchAccountResp = await router.testPostLoginRequest(loginResp, "/v2/account/switch", "POST", {
            accountId: testUtils.defaultTestUser.accountId,
            mode: "test"
        });
        chai.assert.equal(switchAccountResp.statusCode, cassava.httpStatusCode.redirect.FOUND, switchAccountResp.bodyRaw);
        chai.assert.isString(switchAccountResp.headers["Location"]);
        chai.assert.notEqual(switchAccountResp.headers["Set-Cookie"], loginResp.headers["Set-Cookie"]);
        chai.assert.isString(switchAccountResp.headers["Set-Cookie"]);
        chai.assert.match(switchAccountResp.headers["Set-Cookie"], /gb_jwt_session=([^ ;]+)/);
        chai.assert.match(switchAccountResp.headers["Set-Cookie"], /gb_jwt_signature=([^ ;]+)/);

        const secondAccountUsersResp = await router.testPostLoginRequest<AccountUser[]>(switchAccountResp, "/v2/account/users", "GET");
        chai.assert.equal(secondAccountUsersResp.statusCode, cassava.httpStatusCode.success.OK);
        chai.assert.lengthOf(secondAccountUsersResp.body, 3);

        const getAccountResp = await router.testPostLoginRequest<Account>(switchAccountResp, "/v2/account", "GET");
        chai.assert.equal(getAccountResp.statusCode, cassava.httpStatusCode.success.OK);
        chai.assert.equal(getAccountResp.body.id, testUtils.defaultTestUser.accountId);
    });

    it("can update an AccountUser's roles and scopes", async () => {
        const getTeamMateResp = await router.testWebAppRequest<AccountUser>(`/v2/account/users/${testUtils.defaultTestUser.teamMate.userId}`, "GET");
        chai.assert.equal(getTeamMateResp.statusCode, cassava.httpStatusCode.success.OK);
        chai.assert.isAtLeast(getTeamMateResp.body.roles.length, 2, "has at least 2 roles");

        const newRoles = [...getTeamMateResp.body.roles, "AssistantToTheManager"];
        const newScopes = [...getTeamMateResp.body.scopes, "foobar"];

        const patchTeamMemberResp = await router.testWebAppRequest<AccountUser>(`/v2/account/users/${testUtils.defaultTestUser.teamMate.userId}`, "PATCH", {
            roles: newRoles,
            scopes: newScopes
        });
        chai.assert.equal(patchTeamMemberResp.statusCode, cassava.httpStatusCode.success.OK);
        chai.assert.deepEqual(patchTeamMemberResp.body, {
            ...getTeamMateResp.body,
            roles: newRoles,
            scopes: newScopes
        });

        const getUpdatedTeamMateResp = await router.testWebAppRequest<AccountUser>(`/v2/account/users/${testUtils.defaultTestUser.teamMate.userId}`, "GET");
        chai.assert.equal(getUpdatedTeamMateResp.statusCode, cassava.httpStatusCode.success.OK);
        chai.assert.deepEqual(getUpdatedTeamMateResp.body, patchTeamMemberResp.body);
    });

    it("can delete the AccountUser", async () => {
        const newUser = await testUtils.inviteNewUser(router, sinonSandbox);

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
    });
});
