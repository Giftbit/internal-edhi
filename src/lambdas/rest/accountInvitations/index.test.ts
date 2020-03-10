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
import {DbUser} from "../../../db/DbUser";
import chaiExclude from "chai-exclude";
import {AccountUser} from "../../../model/AccountUser";
import {SwitchableAccount} from "../../../model/SwitchableAccount";
import {Account} from "../../../model/Account";
import {LoginResult} from "../../../model/LoginResult";

chai.use(chaiExclude);

describe("/v2/account/invitations", () => {

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

    it("can invite a brand new user, list it, get it, accept it, not delete it after acceptance", async () => {
        let invitationEmail: emailUtils.SendEmailParams;
        sinonSandbox.stub(emailUtils, "sendEmail")
            .callsFake(async (params: emailUtils.SendEmailParams) => {
                invitationEmail = params;
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
        chai.assert.isObject(invitationEmail, "invitation email sent");
        chai.assert.equal(invitationEmail.toAddress, email);
        chai.assert.include(invitationEmail.htmlBody, "Copyright " + new Date().getFullYear(), "copyright is set for this year");
        chai.assert.match(invitationEmail.htmlBody, /Copyright 20\d\d/, "copyright is full year");
        chai.assert.notMatch(invitationEmail.htmlBody, /{{.*}}/, "No unreplaced tokens.");

        const listInvitationsResp = await router.testApiRequest<Invitation[]>("/v2/account/invitations", "GET");
        chai.assert.equal(listInvitationsResp.statusCode, cassava.httpStatusCode.success.OK);
        chai.assert.deepEqual(listInvitationsResp.body, [inviteResp.body]);

        const getInvitationResp = await router.testApiRequest<Invitation>(`/v2/account/invitations/${inviteResp.body.userId}`, "GET");
        chai.assert.equal(getInvitationResp.statusCode, cassava.httpStatusCode.success.OK);
        chai.assert.deepEqual(getInvitationResp.body, inviteResp.body);

        const acceptInvitationToken = /https:\/\/[a-z.]+\/v2\/user\/register\/acceptInvitation\?token=([a-zA-Z0-9]*)/.exec(invitationEmail.htmlBody)[1];
        chai.assert.isString(acceptInvitationToken);

        const acceptInvitationResp = await router.testUnauthedRequest(`/v2/user/register/acceptInvitation?token=${acceptInvitationToken}`, "GET");
        chai.assert.equal(acceptInvitationResp.statusCode, cassava.httpStatusCode.redirect.FOUND, acceptInvitationResp.bodyRaw);
        chai.assert.isString(acceptInvitationResp.headers["Location"]);
        chai.assert.match(acceptInvitationResp.headers["Location"], /https:\/\/.*resetPassword\?token=[a-zA-Z0-9]*/);

        const resetPasswordToken = /https:\/\/.*resetPassword\?token=([a-zA-Z0-9]*)/.exec(acceptInvitationResp.headers["Location"])[1];
        chai.assert.isString(resetPasswordToken);

        const password = generateId();
        const completeResp = await router.testUnauthedRequest<any>(`/v2/user/forgotPassword/complete`, "POST", {
            token: resetPasswordToken,
            password
        });
        chai.assert.equal(completeResp.statusCode, cassava.httpStatusCode.redirect.FOUND);
        chai.assert.isString(completeResp.headers["Location"]);

        const loginResp = await router.testUnauthedRequest<LoginResult>("/v2/user/login", "POST", {
            email,
            password
        });
        chai.assert.equal(loginResp.statusCode, cassava.httpStatusCode.redirect.FOUND);
        chai.assert.isUndefined(loginResp.body.messageCode);
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

        const acceptInvitationLink = /(https:\/\/[a-z.]+\/v2\/user\/register\/acceptInvitation\?token=[a-zA-Z0-9]*)/.exec(firstInviteEmail.htmlBody)[1];
        chai.assert.isString(acceptInvitationLink);

        const acceptInvitationToken = /\?token=([a-zA-Z0-9]*)/.exec(acceptInvitationLink)[1];
        chai.assert.isString(acceptInvitationToken);

        const acceptInvitationResp = await router.testUnauthedRequest(`/v2/user/register/acceptInvitation?token=${acceptInvitationToken}`, "GET");
        chai.assert.equal(acceptInvitationResp.statusCode, cassava.httpStatusCode.redirect.FOUND, acceptInvitationResp.bodyRaw);
        chai.assert.isString(acceptInvitationResp.headers["Location"]);
        chai.assert.match(acceptInvitationResp.headers["Location"], /https:\/\/.*resetPassword\?token=[a-zA-Z0-9]*/);
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

        const acceptInvitationToken = /https:\/\/[a-z.]+\/v2\/user\/register\/acceptInvitation\?token=([a-zA-Z0-9]*)/.exec(firstInviteEmail.htmlBody)[1];
        chai.assert.isString(acceptInvitationToken);

        const acceptInvitationResp = await router.testUnauthedRequest(`/v2/user/register/acceptInvitation?token=${acceptInvitationToken}`, "GET");
        chai.assert.equal(acceptInvitationResp.statusCode, cassava.httpStatusCode.clientError.NOT_FOUND, acceptInvitationResp.bodyRaw);

        const reinviteResp = await router.testApiRequest<Invitation>("/v2/account/invitations", "POST", {
            email: email,
            userPrivilegeType: "FULL_ACCESS"
        });
        chai.assert.equal(reinviteResp.statusCode, cassava.httpStatusCode.success.CREATED);
        chai.assert.equal(reinviteResp.body.accountId, testUtils.defaultTestUser.accountId);
        chai.assert.equal(reinviteResp.body.email, email);

        const acceptReinviteToken = /https:\/\/[a-z.]+\/v2\/user\/register\/acceptInvitation\?token=([a-zA-Z0-9]*)/.exec(reinviteEmail.htmlBody)[1];
        chai.assert.isString(acceptReinviteToken);
        chai.assert.notEqual(acceptReinviteToken, acceptInvitationToken);

        const acceptReinviteResp = await router.testUnauthedRequest(`/v2/user/register/acceptInvitation?token=${acceptReinviteToken}`, "GET");
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

        const newUser = await testUtils.testRegisterNewUser(router, sinonSandbox);

        const firstAccountUsersResp = await router.testPostLoginRequest<AccountUser[]>(newUser.loginResp, "/v2/account/users", "GET");
        chai.assert.equal(firstAccountUsersResp.statusCode, cassava.httpStatusCode.success.OK);
        chai.assert.lengthOf(firstAccountUsersResp.body, 1);

        let inviteEmail: emailUtils.SendEmailParams;
        sinonSandbox.stub(emailUtils, "sendEmail")
            .callsFake(async (params: emailUtils.SendEmailParams) => {
                inviteEmail = params;
                return null;
            });

        // Default test user invites the new user to their account.
        const inviteResp = await router.testApiRequest<Invitation>("/v2/account/invitations", "POST", {
            email: newUser.email,
            userPrivilegeType: "FULL_ACCESS"
        });
        chai.assert.equal(inviteResp.statusCode, cassava.httpStatusCode.success.CREATED);
        chai.assert.equal(inviteResp.body.accountId, testUtils.defaultTestUser.accountId);
        chai.assert.equal(inviteResp.body.email, newUser.email);

        const acceptInvitationToken = /https:\/\/[a-z.]+\/v2\/user\/register\/acceptInvitation\?token=([a-zA-Z0-9]*)/.exec(inviteEmail.htmlBody)[1];
        chai.assert.isString(acceptInvitationToken);

        const acceptInvitationResp = await router.testUnauthedRequest(`/v2/user/register/acceptInvitation?token=${acceptInvitationToken}`, "GET");
        chai.assert.equal(acceptInvitationResp.statusCode, cassava.httpStatusCode.redirect.FOUND, acceptInvitationResp.bodyRaw);
        chai.assert.isString(acceptInvitationResp.headers["Location"]);

        const listAccountsResp = await router.testPostLoginRequest<SwitchableAccount[]>(newUser.loginResp, "/v2/account/switch", "GET");
        chai.assert.lengthOf(listAccountsResp.body, 2);
        chai.assert.isDefined(listAccountsResp.body.find(tm => tm.accountId !== testUtils.defaultTestUser.accountId), listAccountsResp.bodyRaw);
        chai.assert.isDefined(listAccountsResp.body.find(tm => tm.accountId === testUtils.defaultTestUser.accountId), listAccountsResp.bodyRaw);

        const switchAccountResp = await router.testPostLoginRequest(newUser.loginResp, "/v2/account/switch", "POST", {
            accountId: testUtils.defaultTestUser.accountId,
            mode: "test"
        });
        chai.assert.equal(switchAccountResp.statusCode, cassava.httpStatusCode.redirect.FOUND, switchAccountResp.bodyRaw);
        chai.assert.isString(switchAccountResp.headers["Location"]);
        chai.assert.notEqual(switchAccountResp.headers["Set-Cookie"], newUser.loginResp.headers["Set-Cookie"]);
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

    it("lets a user accept an invitation if they register for their own account after being invited but before accepting", async () => {
        let inviteEmail: emailUtils.SendEmailParams;
        let verifyEmail: emailUtils.SendEmailParams;
        sinonSandbox.stub(emailUtils, "sendEmail")
            .onFirstCall()
            .callsFake(async (params: emailUtils.SendEmailParams) => {
                inviteEmail = params;
                return null;
            })
            .onSecondCall()
            .callsFake(async (params: emailUtils.SendEmailParams) => {
                verifyEmail = params;
                return null;
            });

        const email = generateId() + "@example.com";

        const inviteResp = await router.testApiRequest<Invitation>("/v2/account/invitations", "POST", {
            email: email,
            userPrivilegeType: "FULL_ACCESS"
        });
        chai.assert.equal(inviteResp.statusCode, cassava.httpStatusCode.success.CREATED);
        chai.assert.equal(inviteResp.body.accountId, testUtils.defaultTestUser.accountId);
        chai.assert.equal(inviteResp.body.email, email);

        const password = generateId();
        const registerResp = await router.testUnauthedRequest<any>("/v2/user/register", "POST", {
            email,
            password
        });
        chai.assert.equal(registerResp.statusCode, cassava.httpStatusCode.success.CREATED);

        chai.assert.isDefined(verifyEmail);
        const token = /https:\/\/[a-z.]+\/v2\/user\/register\/verifyEmail\?token=([a-zA-Z0-9]*)/.exec(verifyEmail.htmlBody)[1];
        const verifyResp = await router.testUnauthedRequest<any>(`/v2/user/register/verifyEmail?token=${token}`, "GET");
        chai.assert.equal(verifyResp.statusCode, cassava.httpStatusCode.redirect.FOUND);

        const loginResp = await router.testUnauthedRequest<LoginResult>("/v2/user/login", "POST", {
            email,
            password
        });
        chai.assert.equal(loginResp.statusCode, cassava.httpStatusCode.redirect.FOUND);
        chai.assert.isUndefined(loginResp.body.messageCode);

        const acceptInvitationToken = /https:\/\/[a-z.]+\/v2\/user\/register\/acceptInvitation\?token=([a-zA-Z0-9]*)/.exec(inviteEmail.htmlBody)[1];
        chai.assert.isString(acceptInvitationToken);

        const acceptInvitationResp = await router.testUnauthedRequest(`/v2/user/register/acceptInvitation?token=${acceptInvitationToken}`, "GET");
        chai.assert.equal(acceptInvitationResp.statusCode, cassava.httpStatusCode.redirect.FOUND, acceptInvitationResp.bodyRaw);
        chai.assert.isString(acceptInvitationResp.headers["Location"]);

        const listAccountsResp = await router.testPostLoginRequest<SwitchableAccount[]>(loginResp, "/v2/account/switch", "GET");
        chai.assert.lengthOf(listAccountsResp.body, 2);
    });

    it("can cancel an invitation of user to an account that already has its own account, without deleting that user", async () => {
        const newUser = await testUtils.testRegisterNewUser(router, sinonSandbox);

        let inviteEmail: emailUtils.SendEmailParams;
        sinonSandbox.stub(emailUtils, "sendEmail")
            .callsFake(async (params: emailUtils.SendEmailParams) => {
                inviteEmail = params;
                return null;
            });

        // Default test user invites the new user to their account.
        const inviteResp = await router.testApiRequest<Invitation>("/v2/account/invitations", "POST", {
            email: newUser.email,
            userPrivilegeType: "FULL_ACCESS"
        });
        chai.assert.equal(inviteResp.statusCode, cassava.httpStatusCode.success.CREATED);
        chai.assert.equal(inviteResp.body.accountId, testUtils.defaultTestUser.accountId);
        chai.assert.equal(inviteResp.body.email, newUser.email);

        // And then cancels it.
        const deleteInvitationResp = await router.testApiRequest<Invitation>(`/v2/account/invitations/${inviteResp.body.userId}`, "DELETE");
        chai.assert.equal(deleteInvitationResp.statusCode, cassava.httpStatusCode.success.OK);

        const loginResp = await router.testUnauthedRequest<LoginResult>("/v2/user/login", "POST", {
            email: newUser.email,
            password: newUser.password
        });
        chai.assert.equal(loginResp.statusCode, cassava.httpStatusCode.redirect.FOUND);
        chai.assert.isUndefined(loginResp.body.messageCode);

        const getAccountResp = await router.testPostLoginRequest<Account>(loginResp, "/v2/account", "GET");
        chai.assert.equal(getAccountResp.statusCode, cassava.httpStatusCode.success.OK);
        chai.assert.notEqual(getAccountResp.body.id, testUtils.defaultTestUser.accountId, "should not be logged in to the account that deleted the invitation");
    });
});
