import * as cassava from "cassava";
import * as chai from "chai";
import * as sinon from "sinon";
import * as smsUtils from "../../../utils/smsUtils";
import {sendSms} from "../../../utils/smsUtils";
import * as testUtils from "../../../utils/testUtils";
import {TestRouter} from "../../../utils/testUtils/TestRouter";
import {installUnauthedRestRoutes} from "../installUnauthedRestRoutes";
import {installAuthedRestRoutes} from "../installAuthedRestRoutes";
import {DbUserLogin} from "../../../db/DbUserLogin";
import {generateSkewedOtpCode} from "../../../utils/otpUtils";

describe("/v2/user/mfa", () => {

    const router = new TestRouter();
    const sinonSandbox = sinon.createSandbox();

    before(async () => {
        await testUtils.resetDb();
        installUnauthedRestRoutes(router);
        router.route(testUtils.authRoute);
        installAuthedRestRoutes(router);
        DbUserLogin.initializeBadgeSigningSecrets(Promise.resolve({secretkey: "secret"}));
    });

    afterEach(async () => {
        sinonSandbox.restore();

        // Reset MFA status.
        await router.testWebAppRequest("/v2/user/mfa", "DELETE");
    });

    it("returns 404 when no MFA is set", async () => {
        const getMfaResp = await router.testWebAppRequest("/v2/user/mfa", "GET");
        chai.assert.equal(getMfaResp.statusCode, cassava.httpStatusCode.clientError.NOT_FOUND);
    });

    it("requires a method to be defined to enable", async () => {
        const enableMfaResp = await router.testWebAppRequest("/v2/user/mfa", "POST", {});
        chai.assert.equal(enableMfaResp.statusCode, cassava.httpStatusCode.clientError.UNPROCESSABLE_ENTITY);
    });

    describe("SMS MFA", () => {
        it("can be enabled with the correct code", async () => {
            let sms: smsUtils.SendSmsParams;
            sinonSandbox.stub(smsUtils, "sendSms")
                .onFirstCall()
                .callsFake(async params => {
                    sms = params;
                });

            const enableMfaResp = await router.testWebAppRequest("/v2/user/mfa", "POST", {
                device: "+15008675309"
            });
            chai.assert.equal(enableMfaResp.statusCode, cassava.httpStatusCode.success.OK);
            chai.assert.isDefined(sms);
            chai.assert.equal(sms.to, "+15008675309");
            chai.assert.match(sms.body, /\b([A-Z0-9]{6})\b/);

            const code = /\b([A-Z0-9]{6})\b/.exec(sms.body)[1];
            chai.assert.isString(code, "got code from sms");

            const completeResp = await router.testWebAppRequest("/v2/user/mfa/complete", "POST", {
                code: code
            });
            chai.assert.equal(completeResp.statusCode, cassava.httpStatusCode.success.OK, completeResp.bodyRaw);
        });

        it("can can be enabled with a case insensitive code", async () => {
            let sms: smsUtils.SendSmsParams;
            sinonSandbox.stub(smsUtils, "sendSms")
                .onFirstCall()
                .callsFake(async params => {
                    sms = params;
                });

            const enableMfaResp = await router.testWebAppRequest("/v2/user/mfa", "POST", {
                device: "+15008675309"
            });
            chai.assert.equal(enableMfaResp.statusCode, cassava.httpStatusCode.success.OK);
            chai.assert.isDefined(sms);
            chai.assert.equal(sms.to, "+15008675309");
            chai.assert.match(sms.body, /\b([A-Z0-9]{6})\b/);

            const code = /\b([A-Z0-9]{6})\b/.exec(sms.body)[1];
            chai.assert.isString(code, "got code from sms");

            const completeResp = await router.testWebAppRequest("/v2/user/mfa/complete", "POST", {
                code: code.toLowerCase()
            });
            chai.assert.equal(completeResp.statusCode, cassava.httpStatusCode.success.OK, completeResp.bodyRaw);
        });

        it("can send a new code to enable", async () => {
            let sms1: smsUtils.SendSmsParams;
            let sms2: smsUtils.SendSmsParams;
            sinonSandbox.stub(smsUtils, "sendSms")
                .onFirstCall()
                .callsFake(async params => {
                    sms1 = params;
                })
                .onSecondCall()
                .callsFake(async params => {
                    sms2 = params;
                });

            const enableMfa1Resp = await router.testWebAppRequest("/v2/user/mfa", "POST", {
                device: "+15008675309"
            });
            chai.assert.equal(enableMfa1Resp.statusCode, cassava.httpStatusCode.success.OK);
            chai.assert.isDefined(sms1);
            chai.assert.equal(sms1.to, "+15008675309");
            chai.assert.match(sms1.body, /\b([A-Z0-9]{6})\b/);

            const code1 = /\b([A-Z0-9]{6})\b/.exec(sms1.body)[1];
            chai.assert.isString(code1, "got code from sms");

            const enableMfa2Resp = await router.testWebAppRequest("/v2/user/mfa", "POST", {
                device: "+15008675309"
            });
            chai.assert.equal(enableMfa2Resp.statusCode, cassava.httpStatusCode.success.OK);
            chai.assert.isDefined(sms2);
            chai.assert.equal(sms2.to, "+15008675309");
            chai.assert.match(sms2.body, /\b([A-Z0-9]{6})\b/);

            const code2 = /\b([A-Z0-9]{6})\b/.exec(sms2.body)[1];
            chai.assert.isString(code2, "got code from sms");
            chai.assert.notEqual(code1, code2);

            // Code 1 is no longer valid.
            const tryCode1Resp = await router.testWebAppRequest("/v2/user/mfa/complete", "POST", {
                code: code1
            });
            chai.assert.equal(tryCode1Resp.statusCode, cassava.httpStatusCode.clientError.CONFLICT, tryCode1Resp.bodyRaw);

            // Code 2 is valid.
            const tryCode2Resp = await router.testWebAppRequest("/v2/user/mfa/complete", "POST", {
                code: code2
            });
            chai.assert.equal(tryCode2Resp.statusCode, cassava.httpStatusCode.success.OK, tryCode2Resp.bodyRaw);
        });

        it("needs the correct code to enable", async () => {
            let sms: smsUtils.SendSmsParams;
            sinonSandbox.stub(smsUtils, "sendSms")
                .onFirstCall()
                .callsFake(async params => {
                    sms = params;
                });

            const enableMfaResp = await router.testWebAppRequest("/v2/user/mfa", "POST", {
                device: "+15008675309"
            });
            chai.assert.equal(enableMfaResp.statusCode, cassava.httpStatusCode.success.OK);
            chai.assert.isDefined(sms);
            chai.assert.equal(sms.to, "+15008675309");
            chai.assert.match(sms.body, /\b([A-Z0-9]{6})\b/);

            // const token = /\b([A-Z0-9]{6})\b/.exec(sms.body)[1];
            // chai.assert.isString(token, "got token from sms");

            const completeResp = await router.testWebAppRequest("/v2/user/mfa/complete", "POST", {
                code: "ABC"
            });
            chai.assert.equal(completeResp.statusCode, cassava.httpStatusCode.clientError.CONFLICT, completeResp.bodyRaw);
        });

        it("cannot use the code to enable after it expires", async () => {
            let sms: smsUtils.SendSmsParams;
            sinonSandbox.stub(smsUtils, "sendSms")
                .onFirstCall()
                .callsFake(async params => {
                    sms = params;
                });

            const enableMfaResp = await router.testWebAppRequest("/v2/user/mfa", "POST", {
                device: "+15008675309"
            });
            chai.assert.equal(enableMfaResp.statusCode, cassava.httpStatusCode.success.OK);
            chai.assert.isDefined(sms);
            chai.assert.equal(sms.to, "+15008675309");
            chai.assert.match(sms.body, /\b([A-Z0-9]{6})\b/);

            // Manually move back expiresDate
            await DbUserLogin.update(await DbUserLogin.get(testUtils.defaultTestUser.email), {
                action: "put",
                attribute: "mfa.smsAuthState.expiresDate",
                value: new Date(Date.now() - 60 * 1000).toISOString()
            });

            const code = /\b([A-Z0-9]{6})\b/.exec(sms.body)[1];
            chai.assert.isString(code, "got code from sms");

            const completeResp = await router.testWebAppRequest("/v2/user/mfa/complete", "POST", {
                code: code
            });
            chai.assert.equal(completeResp.statusCode, cassava.httpStatusCode.clientError.CONFLICT, completeResp.bodyRaw);
        });

        it("cannot jump straight to the complete step", async () => {
            const completeResp = await router.testWebAppRequest("/v2/user/mfa/complete", "POST", {
                code: "ABCDEF"
            });
            chai.assert.equal(completeResp.statusCode, cassava.httpStatusCode.clientError.CONFLICT);
        });
    });

    describe.only("TOTP MFA", () => {
        it("can be enabled by confirming 2 consecutive codes", async () => {
            const enableMfaResp = await router.testWebAppRequest<{ secret: string }>("/v2/user/mfa", "POST", {
                device: "totp"
            });
            chai.assert.equal(enableMfaResp.statusCode, cassava.httpStatusCode.success.OK);
            chai.assert.isString(enableMfaResp.body.secret);

            const completeMfa1Resp = await router.testWebAppRequest<{ complete: boolean }>("/v2/user/mfa/complete", "POST", {
                code: generateSkewedOtpCode(enableMfaResp.body.secret, -15000)
            });
            chai.assert.equal(completeMfa1Resp.statusCode, cassava.httpStatusCode.success.ACCEPTED);
            chai.assert.isFalse(completeMfa1Resp.body.complete, completeMfa1Resp.bodyRaw);

            const getMfa1Resp = await router.testWebAppRequest("/v2/user/mfa", "GET");
            chai.assert.equal(getMfa1Resp.statusCode, cassava.httpStatusCode.clientError.NOT_FOUND, "not enabled yet");

            const completeMfa2Resp = await router.testWebAppRequest<{ complete: boolean }>("/v2/user/mfa/complete", "POST", {
                code: generateSkewedOtpCode(enableMfaResp.body.secret, 15000)
            });
            chai.assert.equal(completeMfa2Resp.statusCode, cassava.httpStatusCode.success.OK);
            chai.assert.isTrue(completeMfa2Resp.body.complete, completeMfa2Resp.bodyRaw);

            const getMfa2Resp = await router.testWebAppRequest("/v2/user/mfa", "GET");
            chai.assert.equal(getMfa2Resp.statusCode, cassava.httpStatusCode.success.OK, "now it's enabled");
        });

        it("cannot be enabled by entering the same code twice", async () => {
            const enableMfaResp = await router.testWebAppRequest<{ secret: string }>("/v2/user/mfa", "POST", {
                device: "totp"
            });
            chai.assert.equal(enableMfaResp.statusCode, cassava.httpStatusCode.success.OK);
            chai.assert.isString(enableMfaResp.body.secret);

            const code = generateSkewedOtpCode(enableMfaResp.body.secret, -2000);

            const completeMfa1Resp = await router.testWebAppRequest<{ complete: boolean }>("/v2/user/mfa/complete", "POST", {
                code: code
            });
            chai.assert.equal(completeMfa1Resp.statusCode, cassava.httpStatusCode.success.ACCEPTED);
            chai.assert.isFalse(completeMfa1Resp.body.complete, completeMfa1Resp.bodyRaw);

            const completeMfa2Resp = await router.testWebAppRequest<{ complete: boolean }>("/v2/user/mfa/complete", "POST", {
                code: code
            });
            chai.assert.equal(completeMfa2Resp.statusCode, cassava.httpStatusCode.clientError.CONFLICT);

            const getMfaStatusResp = await router.testWebAppRequest("/v2/user/mfa", "GET");
            chai.assert.equal(getMfaStatusResp.statusCode, cassava.httpStatusCode.clientError.NOT_FOUND);
        });
    });

    describe("/v2/user/mfa/backupCodes", () => {
        it("does not have backup codes before setting up MFA", async () => {
            const backupCodesResp = await router.testWebAppRequest<string[]>("/v2/user/mfa/backupCodes", "GET");
            chai.assert.equal(backupCodesResp.statusCode, cassava.httpStatusCode.clientError.NOT_FOUND);
        });

        it("has backup codes after setting up MFA", async () => {
            let sms: smsUtils.SendSmsParams;
            sinonSandbox.stub(smsUtils, "sendSms")
                .onFirstCall()
                .callsFake(async params => {
                    sms = params;
                });

            const enableMfaResp = await router.testWebAppRequest("/v2/user/mfa", "POST", {
                device: "+15008675309"
            });
            chai.assert.equal(enableMfaResp.statusCode, cassava.httpStatusCode.success.OK);

            const code = /\b([A-Z0-9]{6})\b/.exec(sms.body)[1];
            chai.assert.isString(code, "got code from sms");

            const completeResp = await router.testWebAppRequest("/v2/user/mfa/complete", "POST", {
                code: code
            });
            chai.assert.equal(completeResp.statusCode, cassava.httpStatusCode.success.OK, completeResp.bodyRaw);

            const backupCodesResp = await router.testWebAppRequest<string[]>("/v2/user/mfa/backupCodes", "GET");
            chai.assert.equal(backupCodesResp.statusCode, cassava.httpStatusCode.success.OK);
            chai.assert.isArray(backupCodesResp.body);
            chai.assert.isString(backupCodesResp.body[0]);
        });
    });
});
