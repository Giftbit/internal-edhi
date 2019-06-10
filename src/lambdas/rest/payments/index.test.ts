import * as cassava from "cassava";
import * as chai from "chai";
import * as sinon from "sinon";
import * as testUtils from "../../../utils/testUtils";
import {TestRouter} from "../../../utils/testUtils/TestRouter";
import {installUnauthedRestRoutes} from "../installUnauthedRestRoutes";
import {installAuthedRestRoutes} from "../installAuthedRestRoutes";
import {PaymentCreditCard} from "../../../model/PaymentCreditCard";
import {DbUserLogin} from "../../../db/DbUserLogin";

// This sets up the Stripe secret key for testing.
require("dotenv-safe").config();

describe("/v2/account/payments/cards", () => {

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

        // Use a new user to test the code path creating a Stripe customer.
        const userLogin = await testUtils.getNewUserLoginResp(router, sinonSandbox);

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
});
