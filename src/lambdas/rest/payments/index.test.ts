import * as cassava from "cassava";
import * as chai from "chai";
import * as sinon from "sinon";
import * as testUtils from "../../../utils/testUtils";
import {generateId} from "../../../utils/testUtils";
import {ParsedProxyResponse, TestRouter} from "../../../utils/testUtils/TestRouter";
import {installUnauthedRestRoutes} from "../installUnauthedRestRoutes";
import {installAuthedRestRoutes} from "../installAuthedRestRoutes";
import {PaymentCreditCard} from "../../../model/PaymentCreditCard";
import * as emailUtils from "../../../utils/emailUtils";
import {DbUserLogin} from "../../../db/DbUserLogin";

// This sets up the Stripe secret key for testing.
require("dotenv-safe").config();

describe.only("/v2/account/payments/cards", () => {

    const router = new TestRouter();
    const sinonSandbox = sinon.createSandbox();
    const testStripe = !!process.env["TEST_STRIPE_LIVE"];

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

    it("can set, get and delete the card", async function () {
        this.timeout(10000);
        if (!testStripe) {
            this.skip();
        }

        const userLogin = await getNewUserLoginResp();

        const getUnsetCardResp = await router.testPostLoginRequest<PaymentCreditCard>(userLogin, "/v2/account/payments/card", "GET");
        chai.assert.equal(getUnsetCardResp.statusCode, cassava.httpStatusCode.clientError.NOT_FOUND);

        const setCardResp = await router.testPostLoginRequest<PaymentCreditCard>(userLogin, "/v2/account/payments/card", "POST", {
            cardToken: "tok_visa"
        });
        chai.assert.equal(setCardResp.statusCode, cassava.httpStatusCode.success.OK);
        chai.assert.isObject(setCardResp.body);
        chai.assert.deepEqual(setCardResp.body.brand, "Visa");
        chai.assert.deepEqual(setCardResp.body.last4, "4242");

        const getCardResp = await router.testPostLoginRequest<PaymentCreditCard>(userLogin, "/v2/account/payments/card", "GET");
        chai.assert.equal(getCardResp.statusCode, cassava.httpStatusCode.success.OK);
        chai.assert.deepEqual(getCardResp.body, setCardResp.body);

        const deleteCardResp = await router.testPostLoginRequest<PaymentCreditCard>(userLogin, "/v2/account/payments/card", "DELETE");
        chai.assert.equal(getCardResp.statusCode, cassava.httpStatusCode.success.OK);

        const getDeletedCardResp = await router.testPostLoginRequest<PaymentCreditCard>(userLogin, "/v2/account/payments/card", "GET");
        chai.assert.equal(getDeletedCardResp.statusCode, cassava.httpStatusCode.clientError.NOT_FOUND);
    });

    async function getNewUserLoginResp(): Promise<ParsedProxyResponse<any>> {
        let verifyEmail: emailUtils.SendEmailParams;
        sinonSandbox.stub(emailUtils, "sendEmail")
            .callsFake(async (params: emailUtils.SendEmailParams) => {
                verifyEmail = params;
                return null;
            });

        const email = `unittest-${generateId()}@example.com`;
        const password = generateId();
        const registerResp = await router.testUnauthedRequest<any>("/v2/user/register", "POST", {
            email,
            password
        });
        chai.assert.equal(registerResp.statusCode, cassava.httpStatusCode.success.CREATED);

        const token = /https:\/\/[a-z.]+\/v2\/user\/register\/verifyEmail\?token=([a-zA-Z0-9]*)/.exec(verifyEmail.htmlBody)[1];
        const verifyResp = await router.testUnauthedRequest<any>(`/v2/user/register/verifyEmail?token=${token}`, "GET");
        chai.assert.equal(verifyResp.statusCode, cassava.httpStatusCode.redirect.FOUND);

        const loginResp = await router.testUnauthedRequest<any>("/v2/user/login", "POST", {
            email,
            password
        });
        chai.assert.equal(loginResp.statusCode, cassava.httpStatusCode.redirect.FOUND);
        return loginResp;
    }
});
