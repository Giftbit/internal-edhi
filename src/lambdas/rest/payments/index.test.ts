import * as cassava from "cassava";
import * as chai from "chai";
import * as sinon from "sinon";
import * as testUtils from "../../../utils/testUtils";
import {TestRouter} from "../../../utils/testUtils/TestRouter";
import {installUnauthedRestRoutes} from "../installUnauthedRestRoutes";
import {installAuthedRestRoutes} from "../installAuthedRestRoutes";
import {PaymentCreditCard} from "../../../model/PaymentCreditCard";
import {DbUser} from "../../../db/DbUser";

describe("/v2/account/payments/cards", () => {

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

    it("can set, get and delete the card", async () => {
        // Use a new user to test the code path creating a Stripe customer.
        const newUser = await testUtils.testRegisterNewUser(router, sinonSandbox);

        const getUnsetCardResp = await router.testPostLoginRequest<PaymentCreditCard>(newUser.loginResp, "/v2/account/payments/card", "GET");
        chai.assert.equal(getUnsetCardResp.statusCode, cassava.httpStatusCode.clientError.NOT_FOUND);

        const setCardResp = await router.testPostLoginRequest<PaymentCreditCard>(newUser.loginResp, "/v2/account/payments/card", "POST", {
            cardToken: "tok_visa"
        });
        chai.assert.equal(setCardResp.statusCode, cassava.httpStatusCode.success.OK);
        chai.assert.isObject(setCardResp.body);
        chai.assert.deepEqual(setCardResp.body.brand, "Visa");
        chai.assert.deepEqual(setCardResp.body.last4, "4242");

        const getCardResp = await router.testPostLoginRequest<PaymentCreditCard>(newUser.loginResp, "/v2/account/payments/card", "GET");
        chai.assert.equal(getCardResp.statusCode, cassava.httpStatusCode.success.OK);
        chai.assert.deepEqual(getCardResp.body, setCardResp.body);

        const deleteCardResp = await router.testPostLoginRequest<PaymentCreditCard>(newUser.loginResp, "/v2/account/payments/card", "DELETE");
        chai.assert.equal(deleteCardResp.statusCode, cassava.httpStatusCode.success.OK);

        const getDeletedCardResp = await router.testPostLoginRequest<PaymentCreditCard>(newUser.loginResp, "/v2/account/payments/card", "GET");
        chai.assert.equal(getDeletedCardResp.statusCode, cassava.httpStatusCode.clientError.NOT_FOUND);
    }).timeout(20000);

    it("handles card declined", async () => {
        const newUser = await testUtils.testRegisterNewUser(router, sinonSandbox);
        const setCardResp = await router.testPostLoginRequest<any>(newUser.loginResp, "/v2/account/payments/card", "POST", {
            cardToken: "tok_chargeDeclined"
        });
        chai.assert.equal(setCardResp.statusCode, cassava.httpStatusCode.clientError.CONFLICT);
        chai.assert.containIgnoreCase(setCardResp.body.message, "declined");
    }).timeout(20000);

    it("handles incorrect CVC", async () => {
        const newUser = await testUtils.testRegisterNewUser(router, sinonSandbox);
        const setCardResp = await router.testPostLoginRequest<any>(newUser.loginResp, "/v2/account/payments/card", "POST", {
            cardToken: "tok_chargeDeclinedIncorrectCvc"
        });
        chai.assert.equal(setCardResp.statusCode, cassava.httpStatusCode.clientError.CONFLICT);
        chai.assert.containIgnoreCase(setCardResp.body.message, "declined");
    }).timeout(20000);

    it("handles expired card", async () => {
        const newUser = await testUtils.testRegisterNewUser(router, sinonSandbox);
        const setCardResp = await router.testPostLoginRequest<any>(newUser.loginResp, "/v2/account/payments/card", "POST", {
            cardToken: "tok_chargeDeclinedExpiredCard"
        });
        chai.assert.equal(setCardResp.statusCode, cassava.httpStatusCode.clientError.CONFLICT);
        chai.assert.containIgnoreCase(setCardResp.body.message, "declined");
    }).timeout(20000);
});
