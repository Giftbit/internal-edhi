import * as cassava from "cassava";
import * as chai from "chai";
import * as sinon from "sinon";
import * as emailUtils from "../../../utils/emailUtils";
import * as testUtils from "../../../utils/testUtils";
import {generateId} from "../../../utils/testUtils";
import {TestRouter} from "../../../utils/testUtils/TestRouter";
import {installUnauthedRestRoutes} from "../installUnauthedRestRoutes";
import {installAuthedRestRoutes} from "../installAuthedRestRoutes";
import {DbUser} from "../../../db/DbUser";

describe("/v2/user/changeEmail", () => {

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

    it("requires a body", async () => {
        const resp = await router.testWebAppRequest("/v2/user/changeEmail", "POST");
        console.log(resp.bodyRaw);
        chai.assert.equal(resp.statusCode, cassava.httpStatusCode.clientError.UNPROCESSABLE_ENTITY);
    });

    it("cannot change to an invalid email address", async () => {
        let changeEmailAddressEmail: string;
        sinonSandbox.stub(emailUtils, "sendEmail")
            .callsFake(async (params: emailUtils.SendEmailParams) => {
                changeEmailAddressEmail = params.htmlBody;
                return null;
            });

        const resp = await router.testWebAppRequest("/v2/user/changeEmail", "POST", {
            email: "invalid"
        });
        chai.assert.equal(resp.statusCode, cassava.httpStatusCode.clientError.UNPROCESSABLE_ENTITY);
        chai.assert.isUndefined(changeEmailAddressEmail);
    });

    it("changes nothing until the email link is clicked", async () => {
        let changeEmailAddressEmail: string;
        sinonSandbox.stub(emailUtils, "sendEmail")
            .callsFake(async (params: emailUtils.SendEmailParams) => {
                changeEmailAddressEmail = params.htmlBody;
                return null;
            });

        const email = generateId() + "@example.com";
        const changeEmailResp = await router.testWebAppRequest("/v2/user/changeEmail", "POST", {
            email
        });
        chai.assert.equal(changeEmailResp.statusCode, cassava.httpStatusCode.success.OK, changeEmailResp.bodyRaw);
        chai.assert.isDefined(changeEmailAddressEmail);

        const loginResp = await router.testUnauthedRequest("/v2/user/login", "POST", {
            email: testUtils.defaultTestUser.user.email,
            password: testUtils.defaultTestUser.password
        });
        chai.assert.equal(loginResp.statusCode, cassava.httpStatusCode.success.OK);
    });

    it("changes the user's email address", async () => {
        let changeEmailAddressEmail: emailUtils.SendEmailParams;
        let emailAddressChangedEmail: emailUtils.SendEmailParams;
        sinonSandbox.stub(emailUtils, "sendEmail")
            .onFirstCall()
            .callsFake(async (params: emailUtils.SendEmailParams) => {
                changeEmailAddressEmail = params;
                return null;
            })
            .onSecondCall()
            .callsFake(async (params: emailUtils.SendEmailParams) => {
                emailAddressChangedEmail = params;
                return null;
            });

        const email = generateId() + "@example.com";
        const changeEmailResp = await router.testWebAppRequest("/v2/user/changeEmail", "POST", {
            email
        });
        chai.assert.equal(changeEmailResp.statusCode, cassava.httpStatusCode.success.OK);
        chai.assert.isDefined(changeEmailAddressEmail);
        chai.assert.include(changeEmailAddressEmail.htmlBody, "Copyright " + new Date().getFullYear(), "copyright is set for this year");
        chai.assert.match(changeEmailAddressEmail.htmlBody, /Copyright 20\d\d/, "copyright is full year");
        chai.assert.notMatch(changeEmailAddressEmail.htmlBody, /{{.*}}/, "No unreplaced tokens.");
        chai.assert.equal(changeEmailAddressEmail.toAddress, email);
        chai.assert.isUndefined(emailAddressChangedEmail);

        const changeEmailToken = /https:\/\/.*changeEmail\/complete\?token=([a-zA-Z0-9]*)/.exec(changeEmailAddressEmail.htmlBody)[1];
        chai.assert.isDefined(changeEmailToken, "found complete email address change link");

        const completeResp = await router.testUnauthedRequest(`/v2/user/changeEmail/complete?token=${changeEmailToken}`, "GET");
        chai.assert.equal(completeResp.statusCode, cassava.httpStatusCode.success.OK);
        chai.assert.isDefined(emailAddressChangedEmail);
        chai.assert.include(emailAddressChangedEmail.htmlBody, "Copyright " + new Date().getFullYear(), "copyright is set for this year");
        chai.assert.match(emailAddressChangedEmail.htmlBody, /Copyright 20\d\d/, "copyright is full year");
        chai.assert.notMatch(emailAddressChangedEmail.htmlBody, /{{.*}}/, "No unreplaced tokens.");

        const cantLoginOldEmailResp = await router.testUnauthedRequest("/v2/user/login", "POST", {
            email: testUtils.defaultTestUser.user.email,
            password: testUtils.defaultTestUser.password
        });
        chai.assert.equal(cantLoginOldEmailResp.statusCode, cassava.httpStatusCode.clientError.UNAUTHORIZED);

        const canLoginNewEmailResp = await router.testUnauthedRequest("/v2/user/login", "POST", {
            email,
            password: testUtils.defaultTestUser.password
        });
        chai.assert.equal(canLoginNewEmailResp.statusCode, cassava.httpStatusCode.success.OK);
    });

    it("cannot change the email address to one already used in the system (but won't acknowledge that it's in use)", async () => {
        let changeEmailAddressEmail: string;
        sinonSandbox.stub(emailUtils, "sendEmail")
            .callsFake(async (params: emailUtils.SendEmailParams) => {
                changeEmailAddressEmail = params.htmlBody;
                return null;
            });

        const resp = await router.testWebAppRequest("/v2/user/changeEmail", "POST", {
            email: testUtils.defaultTestUser.teamMate.email
        });
        chai.assert.equal(resp.statusCode, cassava.httpStatusCode.success.OK);
        chai.assert.isUndefined(changeEmailAddressEmail);
    });

    it("cannot change two users to the same email address", async () => {
        let changeEmailAddressEmail1: emailUtils.SendEmailParams;
        let changeEmailAddressEmail2: emailUtils.SendEmailParams;
        sinonSandbox.stub(emailUtils, "sendEmail")
            .onFirstCall()
            .callsFake(async (params: emailUtils.SendEmailParams) => {
                changeEmailAddressEmail1 = params;
                return null;
            })
            .onSecondCall()
            .callsFake(async (params: emailUtils.SendEmailParams) => {
                changeEmailAddressEmail2 = params;
                return null;
            });

        const email = generateId() + "@example.com";
        const changeEmailResp1 = await router.testWebAppRequest("/v2/user/changeEmail", "POST", {
            email
        });
        chai.assert.equal(changeEmailResp1.statusCode, cassava.httpStatusCode.success.OK);
        chai.assert.isDefined(changeEmailAddressEmail1);

        const changeEmailResp2 = await router.testTeamMateRequest("/v2/user/changeEmail", "POST", {
            email
        });
        chai.assert.equal(changeEmailResp2.statusCode, cassava.httpStatusCode.success.OK);
        chai.assert.isDefined(changeEmailAddressEmail2);

        const changeEmailToken1 = /https:\/\/.*changeEmail\/complete\?token=([a-zA-Z0-9]*)/.exec(changeEmailAddressEmail1.htmlBody)[1];
        chai.assert.isDefined(changeEmailToken1, "found complete email address change link");

        const complete1Resp = await router.testUnauthedRequest(`/v2/user/changeEmail/complete?token=${changeEmailToken1}`, "GET");
        chai.assert.equal(complete1Resp.statusCode, cassava.httpStatusCode.success.OK);

        const changeEmailToken2 = /https:\/\/.*changeEmail\/complete\?token=([a-zA-Z0-9]*)/.exec(changeEmailAddressEmail2.htmlBody)[1];
        chai.assert.isDefined(changeEmailToken2, "found complete email address change link");

        const complete2Resp = await router.testUnauthedRequest(`/v2/user/changeEmail/complete?token=${changeEmailToken2}`, "GET");
        chai.assert.equal(complete2Resp.statusCode, cassava.httpStatusCode.clientError.CONFLICT);
    });
});
