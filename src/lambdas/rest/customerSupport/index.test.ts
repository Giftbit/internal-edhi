import * as chai from "chai";
import * as cassava from "cassava";
import * as sinon from "sinon";
import * as emailUtils from "../../../utils/emailUtils";
import * as testUtils from "../../../utils/testUtils";
import {TestRouter} from "../../../utils/testUtils/TestRouter";
import {installUnauthedRestRoutes} from "../installUnauthedRestRoutes";
import {installAuthedRestRoutes} from "../installAuthedRestRoutes";
import {DbUser} from "../../../db/DbUser";

describe("/v2/user/contactCustomerSupport", () => {

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

    it("sends an email to customer support", async () => {
        let emailParams: emailUtils.SendEmailParams = null;
        sinonSandbox.stub(emailUtils, "sendEmail")
            .callsFake(async (params: emailUtils.SendEmailParams) => {
                emailParams = params;
                return null;
            });

        const subject = "Where is that large automobile?";
        const message = "Letting the days go by, let the water hold me down\n" +
            "Letting the days go by, water flowing underground\n" +
            "Into the blue again after the money's gone\n" +
            "Once in a lifetime, water flowing underground";
        const contactResp = await router.testWebAppRequest("/v2/user/contactCustomerSupport", "POST", {
            customerSupportEmail: "support@giftbit.com",
            subject: subject,
            message: message
        });
        chai.assert.equal(contactResp.statusCode, cassava.httpStatusCode.success.OK, contactResp.bodyRaw);
        chai.assert.isObject(emailParams, "email sent");
        chai.assert.include(emailParams.subject, subject);
        chai.assert.include(emailParams.textBody, message);
        chai.assert.include(emailParams.textBody, testUtils.defaultTestUser.accountId);
        chai.assert.include(emailParams.textBody, testUtils.defaultTestUser.userId);
        chai.assert.include(emailParams.textBody, testUtils.defaultTestUser.email);
    });

    it("can't send an email to a non @lightrail.com or @giftbit.com address", async () => {
        let emailSent = false;
        sinonSandbox.stub(emailUtils, "sendEmail")
            .callsFake(async (params: emailUtils.SendEmailParams) => {
                emailSent = true;
                return null;
            });

        const subject = "We can dance if we want to";
        const message = "we can leave your friends behind\n" +
            "Cause your friends don't dance and if they don't dance\n" +
            "Well they're are no friends of mine";
        const contactResp = await router.testWebAppRequest("/v2/user/contactCustomerSupport", "POST", {
            customerSupportEmail: "manwithhat@example.com",
            subject: subject,
            message: message
        });
        chai.assert.equal(contactResp.statusCode, cassava.httpStatusCode.clientError.UNPROCESSABLE_ENTITY, contactResp.bodyRaw);
        chai.assert.isFalse(emailSent);
    });
});
