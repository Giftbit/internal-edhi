import * as cassava from "cassava";
import * as chai from "chai";
import * as sinon from "sinon";
import * as emailUtils from "../../../utils/emailUtils";
import * as testUtils from "../../../utils/testUtils";
import {generateId} from "../../../utils/testUtils";
import {TestRouter} from "../../../utils/testUtils/TestRouter";
import {installUnauthedRestRoutes} from "../installUnauthedRestRoutes";
import {installAuthedRestRoutes} from "../installAuthedRestRoutes";
import {Invitation} from "./Invitation";
import {DbUser} from "../../../db/DbUser";

describe("/v2/account", () => {

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
        let inviteEmail: emailUtils.SendEmailParams;
        sinonSandbox.stub(emailUtils, "sendEmail")
            .callsFake(async (params: emailUtils.SendEmailParams) => {
                inviteEmail = params;
                return null;
            });

        const email = testUtils.generateId() + "@example.com";
        const inviteResp = await router.testApiRequest<Invitation>("/v2/account/invites", "POST", {
            email: email,
            access: "full"
        });
        chai.assert.equal(inviteResp.statusCode, cassava.httpStatusCode.success.CREATED);
        chai.assert.equal(inviteResp.body.userId, testUtils.defaultTestUser.userId);
        chai.assert.equal(inviteResp.body.email, email);
        chai.assert.isObject(inviteEmail, "invite email sent");
        chai.assert.equal(inviteEmail.toAddress, email);
        chai.assert.notMatch(inviteEmail.htmlBody, /{{.*}}/, "No unreplaced tokens.");

        const listInvitationsResp = await router.testApiRequest<Invitation[]>("/v2/account/invites", "GET");
        chai.assert.equal(listInvitationsResp.statusCode, cassava.httpStatusCode.success.OK);
        chai.assert.deepEqual(listInvitationsResp.body, [inviteResp.body]);

        const getInvitationResp = await router.testApiRequest<Invitation>(`/v2/account/invites/${inviteResp.body.teamMemberId}`, "GET");
        chai.assert.equal(getInvitationResp.statusCode, cassava.httpStatusCode.success.OK);
        chai.assert.deepEqual(getInvitationResp.body, inviteResp.body);

        const acceptInviteLink = /(https:\/\/[a-z.]+\/v2\/user\/register\/acceptInvite\?token=[a-zA-Z0-9]*)/.exec(inviteEmail.htmlBody)[1];
        chai.assert.isString(acceptInviteLink);

        const acceptInviteToken = /\?token=([a-zA-Z0-9]*)/.exec(acceptInviteLink)[1];
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

        const cantDeleteInvitationResp = await router.testApiRequest<Invitation>(`/v2/account/invites/${inviteResp.body.teamMemberId}`, "DELETE");
        chai.assert.equal(cantDeleteInvitationResp.statusCode, cassava.httpStatusCode.clientError.CONFLICT);
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
        const inviteResp = await router.testApiRequest<Invitation>("/v2/account/invites", "POST", {
            email: email,
            access: "full"
        });
        chai.assert.equal(inviteResp.statusCode, cassava.httpStatusCode.success.CREATED);
        chai.assert.equal(inviteResp.body.userId, testUtils.defaultTestUser.userId);
        chai.assert.equal(inviteResp.body.email, email);

        const listInvitationsResp = await router.testApiRequest<Invitation[]>("/v2/account/invites", "GET");
        chai.assert.equal(listInvitationsResp.statusCode, cassava.httpStatusCode.success.OK);
        chai.assert.deepEqual(listInvitationsResp.body, [inviteResp.body]);

        const deleteInvitationResp = await router.testApiRequest<Invitation>(`/v2/account/invites/${inviteResp.body.teamMemberId}`, "DELETE");
        chai.assert.equal(deleteInvitationResp.statusCode, cassava.httpStatusCode.success.OK);

        const acceptInviteToken = /https:\/\/[a-z.]+\/v2\/user\/register\/acceptInvite\?token=([a-zA-Z0-9]*)/.exec(firstInviteEmail.htmlBody)[1];
        chai.assert.isString(acceptInviteToken);

        const acceptInviteResp = await router.testUnauthedRequest(`/v2/user/register/acceptInvite?token=${acceptInviteToken}`, "GET");
        chai.assert.equal(acceptInviteResp.statusCode, cassava.httpStatusCode.clientError.NOT_FOUND, acceptInviteResp.bodyRaw);

        const reinviteResp = await router.testApiRequest<Invitation>("/v2/account/invites", "POST", {
            email: email,
            access: "full"
        });
        chai.assert.equal(reinviteResp.statusCode, cassava.httpStatusCode.success.CREATED);
        chai.assert.equal(reinviteResp.body.userId, testUtils.defaultTestUser.userId);
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

    it("can invite a user to your account that already has their own account", async () => {
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

        const token = /https:\/\/[a-z.]+\/v2\/user\/register\/verifyEmail\?token=(.*)/.exec(verifyEmail.htmlBody)[1];
        const verifyResp = await router.testUnauthedRequest<any>(`/v2/user/register/verifyEmail?token=${token}`, "GET");
        chai.assert.equal(verifyResp.statusCode, cassava.httpStatusCode.redirect.FOUND);
        chai.assert.isString(verifyResp.headers["Location"]);

        const loginResp = await router.testUnauthedRequest<any>("/v2/user/login", "POST", {
            email: email,
            password: password
        });
        chai.assert.equal(loginResp.statusCode, cassava.httpStatusCode.redirect.FOUND);

        // Default test user invites the new user to their account.
        const inviteResp = await router.testApiRequest<Invitation>("/v2/account/invites", "POST", {
            email: email,
            access: "full"
        });
        chai.assert.equal(inviteResp.statusCode, cassava.httpStatusCode.success.CREATED);
        chai.assert.equal(inviteResp.body.userId, testUtils.defaultTestUser.userId);
        chai.assert.equal(inviteResp.body.email, email);

        const acceptInviteToken = /https:\/\/[a-z.]+\/v2\/user\/register\/acceptInvite\?token=([a-zA-Z0-9]*)/.exec(inviteEmail.htmlBody)[1];
        chai.assert.isString(acceptInviteToken);

        const acceptInviteResp = await router.testUnauthedRequest(`/v2/user/register/acceptInvite?token=${acceptInviteToken}`, "GET");
        chai.assert.equal(acceptInviteResp.statusCode, cassava.httpStatusCode.redirect.FOUND, acceptInviteResp.bodyRaw);
        chai.assert.isString(acceptInviteResp.headers["Location"]);
        chai.assert.match(acceptInviteResp.headers["Location"], /https:\/\/.*resetPassword\?token=[a-zA-Z0-9]*/);

        // TODO switch accounts
    });
});
