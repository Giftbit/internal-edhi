import * as cassava from "cassava";
import * as chai from "chai";
import * as crypto from "crypto";
import * as sinon from "sinon";
import * as emailUtils from "../../../utils/emailUtils";
import * as testUtils from "../../../utils/testUtils";
import {generateId} from "../../../utils/testUtils";
import {ParsedProxyResponse, TestRouter} from "../../../utils/testUtils/TestRouter";
import {dynamodb, objectDynameh} from "../../../db/dynamodb";
import {installUnauthedRestRoutes} from "../installUnauthedRestRoutes";
import {DbUserLogin} from "../../../db/DbUserLogin";
import {installAuthedRestRoutes} from "../installAuthedRestRoutes";
import * as smsUtils from "../../../utils/smsUtils";
import {generateSkewedOtpCode, initializeOtpEncryptionSecrets} from "../../../utils/otpUtils";
import {LoginResult} from "../../../model/LoginResult";
import {Account} from "../../../model/Account";

describe("/v2/user/login", () => {

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

    async function assertFullyLoggedIn(loginResp: ParsedProxyResponse<any>): Promise<void> {
        chai.assert.isString(loginResp.headers["Location"]);
        chai.assert.isString(loginResp.headers["Set-Cookie"]);
        chai.assert.match(loginResp.headers["Set-Cookie"], /gb_jwt_session=([^ ;]+)/);
        chai.assert.match(loginResp.headers["Set-Cookie"], /gb_jwt_signature=([^ ;]+)/);
        const accountUsersResp = await router.testPostLoginRequest(loginResp, "/v2/account/users", "GET");
        chai.assert.equal(accountUsersResp.statusCode, cassava.httpStatusCode.success.OK, "prove we're logged in");
    }

    async function assertNotFullyLoggedIn(loginResp: ParsedProxyResponse<any>): Promise<void> {
        const accountUsersResp = await router.testPostLoginRequest(loginResp, "/v2/account/users", "GET");
        chai.assert.oneOf(accountUsersResp.statusCode, [cassava.httpStatusCode.clientError.FORBIDDEN, cassava.httpStatusCode.clientError.UNAUTHORIZED], "prove we're not logged in");
    }

    it("422s when missing an email", async () => {
        const resp = await router.testUnauthedRequest("/v2/user/login", "POST", {
            password: generateId()
        });
        chai.assert.equal(resp.statusCode, cassava.httpStatusCode.clientError.UNPROCESSABLE_ENTITY);
    });

    it("422s when missing a password", async () => {
        const resp = await router.testUnauthedRequest("/v2/user/login", "POST", {
            email: "user@example.com"
        });
        chai.assert.equal(resp.statusCode, cassava.httpStatusCode.clientError.UNPROCESSABLE_ENTITY);
    });

    it("cannot login with a user who does not exist", async () => {
        const resp = await router.testUnauthedRequest("/v2/user/login", "POST", {
            email: "nonexistant@example.com",
            password: generateId()
        });
        chai.assert.equal(resp.statusCode, cassava.httpStatusCode.clientError.UNAUTHORIZED);
    });

    it("cannot login with a user with the wrong password", async () => {
        const resp = await router.testUnauthedRequest("/v2/user/login", "POST", {
            email: testUtils.defaultTestUser.email,
            password: generateId()
        });
        chai.assert.equal(resp.statusCode, cassava.httpStatusCode.clientError.UNAUTHORIZED);
    });

    it("can login the test user", async () => {
        const resp = await router.testUnauthedRequest<LoginResult>("/v2/user/login", "POST", {
            email: testUtils.defaultTestUser.email,
            password: testUtils.defaultTestUser.password
        });
        chai.assert.equal(resp.statusCode, cassava.httpStatusCode.redirect.FOUND);
        chai.assert.isUndefined(resp.body.messageCode);
        chai.assert.isString(resp.headers["Location"]);
        chai.assert.isString(resp.headers["Set-Cookie"]);
        chai.assert.match(resp.headers["Set-Cookie"], /gb_jwt_session=([^ ;]+)/);
        chai.assert.match(resp.headers["Set-Cookie"], /gb_jwt_signature=([^ ;]+)/);

        await assertFullyLoggedIn(resp);
    });

    it("can log in a user that was removed from their only account (and they can create a new account)", async () => {
        const newUser = await testUtils.inviteNewUser(router, sinonSandbox);

        const deleteUserResp = await router.testApiRequest(`/v2/account/users/${newUser.userId}`, "DELETE");
        chai.assert.equal(deleteUserResp.statusCode, cassava.httpStatusCode.success.OK, deleteUserResp.bodyRaw);

        const loginResp = await router.testUnauthedRequest<LoginResult>("/v2/user/login", "POST", {
            email: newUser.email,
            password: newUser.password
        });
        chai.assert.equal(loginResp.statusCode, cassava.httpStatusCode.redirect.FOUND);
        chai.assert.equal(loginResp.body.messageCode, "NoAccount");
        await assertNotFullyLoggedIn(loginResp);

        const createAccountResp = await router.testPostLoginRequest<Account>(loginResp, "/v2/account", "POST", {
            name: "Totally Not a Drug Front"
        });
        chai.assert.equal(createAccountResp.statusCode, cassava.httpStatusCode.success.CREATED);

        const switchAccountResp = await router.testPostLoginRequest<LoginResult>(loginResp, "/v2/account/switch", "POST", {
            accountId: createAccountResp.body.id,
            mode: "test"
        });
        chai.assert.equal(switchAccountResp.statusCode, cassava.httpStatusCode.redirect.FOUND, switchAccountResp.bodyRaw);
        chai.assert.isUndefined(switchAccountResp.body.messageCode);
    });

    it("locks the user for an hour after 10 unsuccessful login attempts", async () => {
        let lockedEmail: string;
        sinonSandbox.stub(emailUtils, "sendEmail")
            .callsFake(async (params: emailUtils.SendEmailParams) => {
                lockedEmail = params.htmlBody;
                return null;
            });

        for (let i = 0; i < 10; i++) {
            const resp = await router.testUnauthedRequest("/v2/user/login", "POST", {
                email: testUtils.defaultTestUser.email,
                password: generateId()
            });
            chai.assert.equal(resp.statusCode, cassava.httpStatusCode.clientError.UNAUTHORIZED);
            if (i < 9) {
                chai.assert.isUndefined(lockedEmail, `Did not get locked email on attempt ${i}`);
            } else {
                chai.assert.isString(lockedEmail, "Got locked account warning email after the last attempt.");
                chai.assert.notMatch(lockedEmail, /{{.*}}/, "No unreplaced tokens.");
            }
        }

        const goodPasswordButLockedResp = await router.testUnauthedRequest("/v2/user/login", "POST", {
            email: testUtils.defaultTestUser.email,
            password: testUtils.defaultTestUser.password
        });
        chai.assert.equal(goodPasswordButLockedResp.statusCode, cassava.httpStatusCode.clientError.UNAUTHORIZED);

        // Manually move the lockedUntilDate to over an hour ago.
        const pastLockedDate = new Date();
        pastLockedDate.setMinutes(pastLockedDate.getMinutes() - 65);
        const updateLockedDateReq = objectDynameh.requestBuilder.buildUpdateInputFromActions(
            DbUserLogin.getKeys(testUtils.defaultTestUser.userLogin),
            {
                action: "put",
                attribute: "lockedUntilDate",
                value: pastLockedDate.toISOString()
            }
        );
        await dynamodb.updateItem(updateLockedDateReq).promise();

        const goodLoginResp = await router.testUnauthedRequest("/v2/user/login", "POST", {
            email: testUtils.defaultTestUser.email,
            password: testUtils.defaultTestUser.password
        });
        chai.assert.equal(goodLoginResp.statusCode, cassava.httpStatusCode.redirect.FOUND);
    });

    it("does not log in a user that hasn't verified their email address, triggering sending another email", async () => {
        let verifyUrl1: string;
        let verifyUrl2: string;
        sinonSandbox.stub(emailUtils, "sendEmail")
            .onFirstCall()
            .callsFake(async (params: emailUtils.SendEmailParams) => {
                const verifyEmailMatcher = /(https:\/\/[a-z.]+\/v2\/user\/register\/verifyEmail\?token=[a-zA-Z0-9]*)/.exec(params.htmlBody);
                verifyUrl1 = verifyEmailMatcher[1];
                return null;
            })
            .onSecondCall()
            .callsFake(async (params: emailUtils.SendEmailParams) => {
                const verifyEmailMatcher = /(https:\/\/[a-z.]+\/v2\/user\/register\/verifyEmail\?token=[a-zA-Z0-9]*)/.exec(params.htmlBody);
                verifyUrl2 = verifyEmailMatcher[1];
                return null;
            });

        const email = generateId() + "@example.com";
        const password = generateId();
        const registerResp = await router.testUnauthedRequest<any>("/v2/user/register", "POST", {
            email,
            password
        });
        chai.assert.equal(registerResp.statusCode, cassava.httpStatusCode.success.CREATED);
        chai.assert.isString(verifyUrl1, "Found verify url in email body.");
        chai.assert.isUndefined(verifyUrl2, "Second email not sent out yet.");

        const loginResp1 = await router.testUnauthedRequest<any>("/v2/user/login", "POST", {
            email,
            password
        });
        chai.assert.equal(loginResp1.statusCode, cassava.httpStatusCode.clientError.UNAUTHORIZED);
        chai.assert.isString(verifyUrl2, "Found verify url in second email body.");

        const token = /\/v2\/user\/register\/verifyEmail\?token=(.*)/.exec(verifyUrl2)[1];
        const verifyResp = await router.testUnauthedRequest<any>(`/v2/user/register/verifyEmail?token=${token}`, "GET");
        chai.assert.equal(verifyResp.statusCode, cassava.httpStatusCode.redirect.FOUND);
        chai.assert.isString(verifyResp.headers["Location"]);

        const loginResp2 = await router.testUnauthedRequest<any>("/v2/user/login", "POST", {
            email,
            password
        });
        chai.assert.equal(loginResp2.statusCode, cassava.httpStatusCode.redirect.FOUND, loginResp2.bodyRaw);
        chai.assert.isString(loginResp2.headers["Location"]);
        chai.assert.isString(loginResp2.headers["Set-Cookie"]);
        chai.assert.match(loginResp2.headers["Set-Cookie"], /gb_jwt_session=([^ ;]+)/);
        chai.assert.match(loginResp2.headers["Set-Cookie"], /gb_jwt_signature=([^ ;]+)/);
    });

    it("can logout", async () => {
        const resp = await router.testWebAppRequest("/v2/user/logout", "POST");
        chai.assert.equal(resp.statusCode, cassava.httpStatusCode.redirect.FOUND, resp.bodyRaw);
        chai.assert.isString(resp.headers["Location"]);
        chai.assert.isString(resp.headers["Set-Cookie"]);
        chai.assert.match(resp.headers["Set-Cookie"], /gb_jwt_session=([^ ;]*).*Expires=Thu, 01 Jan 1970 00:00:00 GMT/);
        chai.assert.match(resp.headers["Set-Cookie"], /gb_jwt_signature=([^ ;]*).*Expires=Thu, 01 Jan 1970 00:00:00 GMT/);
    });

    describe("SMS MFA login", () => {
        it("starts login with an auth token that can only complete authentication", async () => {
            await testUtils.enableSmsMfa(testUtils.defaultTestUser.email);
            sinonSandbox.stub(smsUtils, "sendSms")
                .callsFake(async params => {
                });

            const loginResp = await router.testUnauthedRequest<LoginResult>("/v2/user/login", "POST", {
                email: testUtils.defaultTestUser.email,
                password: testUtils.defaultTestUser.password
            });
            chai.assert.equal(loginResp.statusCode, cassava.httpStatusCode.redirect.FOUND);
            chai.assert.equal(loginResp.body.messageCode, "MfaAuthRequired");

            const pingResp = await router.testPostLoginRequest(loginResp, "/v2/user/ping", "GET");
            chai.assert.equal(pingResp.statusCode, cassava.httpStatusCode.success.OK, "token has permission to call ping");

            await assertNotFullyLoggedIn(loginResp);

            const changePasswordResp = await router.testPostLoginRequest(loginResp, "/v2/user/changePassword", "POST", {
                oldPassword: testUtils.defaultTestUser.password,
                newPassword: generateId()
            });
            chai.assert.equal(changePasswordResp.statusCode, cassava.httpStatusCode.clientError.FORBIDDEN, "token does not have permission to change password");
        });

        it("can complete login with the correct SMS code", async () => {
            await testUtils.enableSmsMfa(testUtils.defaultTestUser.email);
            let sms: smsUtils.SendSmsParams;
            sinonSandbox.stub(smsUtils, "sendSms")
                .onFirstCall()
                .callsFake(async params => {
                    sms = params;
                });

            const loginResp = await router.testUnauthedRequest<LoginResult>("/v2/user/login", "POST", {
                email: testUtils.defaultTestUser.email,
                password: testUtils.defaultTestUser.password
            });
            chai.assert.equal(loginResp.statusCode, cassava.httpStatusCode.redirect.FOUND);
            chai.assert.equal(loginResp.body.messageCode, "MfaAuthRequired");

            const code = /\b([A-Z0-9]{6})\b/.exec(sms.body)[1];
            chai.assert.isString(code);

            const wrongCodeLoginCompleteResp = await router.testPostLoginRequest(loginResp, "/v2/user/login/mfa", "POST", {
                code: "QQQQQQ"
            });
            chai.assert.equal(wrongCodeLoginCompleteResp.statusCode, cassava.httpStatusCode.clientError.UNAUTHORIZED);

            const loginCompleteResp = await router.testPostLoginRequest(loginResp, "/v2/user/login/mfa", "POST", {
                code: code
            });
            chai.assert.equal(loginCompleteResp.statusCode, cassava.httpStatusCode.redirect.FOUND);
            chai.assert.isString(loginCompleteResp.headers["Location"]);
            chai.assert.isString(loginCompleteResp.headers["Set-Cookie"]);
            chai.assert.match(loginCompleteResp.headers["Set-Cookie"], /gb_jwt_session=([^ ;]+)/);
            chai.assert.match(loginCompleteResp.headers["Set-Cookie"], /gb_jwt_signature=([^ ;]+)/);

            await assertFullyLoggedIn(loginCompleteResp);
        });

        it("can complete login with a case-insensitive code", async () => {
            await testUtils.enableSmsMfa(testUtils.defaultTestUser.email);
            let sms: smsUtils.SendSmsParams;
            sinonSandbox.stub(smsUtils, "sendSms")
                .onFirstCall()
                .callsFake(async params => {
                    sms = params;
                });

            const loginResp = await router.testUnauthedRequest("/v2/user/login", "POST", {
                email: testUtils.defaultTestUser.email,
                password: testUtils.defaultTestUser.password
            });
            chai.assert.equal(loginResp.statusCode, cassava.httpStatusCode.redirect.FOUND);

            const code = /\b([A-Z0-9]{6})\b/.exec(sms.body)[1];
            chai.assert.isString(code);

            const loginCompleteResp = await router.testPostLoginRequest(loginResp, "/v2/user/login/mfa", "POST", {
                code: code.toLowerCase()
            });
            chai.assert.equal(loginCompleteResp.statusCode, cassava.httpStatusCode.redirect.FOUND);

            await assertFullyLoggedIn(loginCompleteResp);
        });

        it("can send a new code (invalidating the old one)", async () => {
            await testUtils.enableSmsMfa(testUtils.defaultTestUser.email);
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

            const loginResp = await router.testUnauthedRequest("/v2/user/login", "POST", {
                email: testUtils.defaultTestUser.email,
                password: testUtils.defaultTestUser.password
            });
            chai.assert.equal(loginResp.statusCode, cassava.httpStatusCode.redirect.FOUND);

            const code1 = /\b([A-Z0-9]{6})\b/.exec(sms1.body)[1];
            chai.assert.isString(code1);
            chai.assert.isUndefined(sms2);

            const sendNewCodeResp = await router.testPostLoginRequest(loginResp, "/v2/user/login/mfa", "GET");
            chai.assert.equal(sendNewCodeResp.statusCode, cassava.httpStatusCode.success.OK);

            const code2 = /\b([A-Z0-9]{6})\b/.exec(sms2.body)[1];
            chai.assert.isString(code2);
            chai.assert.notEqual(code2, code1);

            const oldCodeLoginCompleteResp = await router.testPostLoginRequest(loginResp, "/v2/user/login/mfa", "POST", {
                code: code1
            });
            chai.assert.equal(oldCodeLoginCompleteResp.statusCode, cassava.httpStatusCode.clientError.UNAUTHORIZED);

            const loginCompleteResp = await router.testPostLoginRequest(loginResp, "/v2/user/login/mfa", "POST", {
                code: code2
            });
            chai.assert.equal(loginCompleteResp.statusCode, cassava.httpStatusCode.redirect.FOUND);

            await assertFullyLoggedIn(loginCompleteResp);
        });

        it("is secure against replay attack (using the same code a second time)", async () => {
            await testUtils.enableSmsMfa(testUtils.defaultTestUser.email);
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

            const login1Resp = await router.testUnauthedRequest("/v2/user/login", "POST", {
                email: testUtils.defaultTestUser.email,
                password: testUtils.defaultTestUser.password
            });
            chai.assert.equal(login1Resp.statusCode, cassava.httpStatusCode.redirect.FOUND);

            const code1 = /\b([A-Z0-9]{6})\b/.exec(sms1.body)[1];
            chai.assert.isString(code1);
            chai.assert.isUndefined(sms2);

            const login1CompleteResp = await router.testPostLoginRequest(login1Resp, "/v2/user/login/mfa", "POST", {
                code: code1
            });
            chai.assert.equal(login1CompleteResp.statusCode, cassava.httpStatusCode.redirect.FOUND);

            const login2Resp = await router.testUnauthedRequest("/v2/user/login", "POST", {
                email: testUtils.defaultTestUser.email,
                password: testUtils.defaultTestUser.password
            });
            chai.assert.equal(login2Resp.statusCode, cassava.httpStatusCode.redirect.FOUND);

            const login2CompleteResp = await router.testPostLoginRequest(login2Resp, "/v2/user/login/mfa", "POST", {
                code: code1
            });
            chai.assert.equal(login2CompleteResp.statusCode, cassava.httpStatusCode.clientError.UNAUTHORIZED);
        });
    });

    describe("TOTP MFA login", () => {
        it("starts login with an auth token that can only complete authentication", async () => {
            await testUtils.enableTotpMfa(testUtils.defaultTestUser.email);

            const loginResp = await router.testUnauthedRequest<LoginResult>("/v2/user/login", "POST", {
                email: testUtils.defaultTestUser.email,
                password: testUtils.defaultTestUser.password
            });
            chai.assert.equal(loginResp.statusCode, cassava.httpStatusCode.redirect.FOUND);
            chai.assert.equal(loginResp.body.messageCode, "MfaAuthRequired");

            const pingResp = await router.testPostLoginRequest(loginResp, "/v2/user/ping", "GET");
            chai.assert.equal(pingResp.statusCode, cassava.httpStatusCode.success.OK, "token has permission to call ping");

            await assertNotFullyLoggedIn(loginResp);

            const changePasswordResp = await router.testPostLoginRequest(loginResp, "/v2/user/changePassword", "POST", {
                oldPassword: testUtils.defaultTestUser.password,
                newPassword: generateId()
            });
            chai.assert.equal(changePasswordResp.statusCode, cassava.httpStatusCode.clientError.FORBIDDEN, "token does not have permission to change password");
        });

        it("can complete login with the correct TOTP code", async () => {
            const secret = await testUtils.enableTotpMfa(testUtils.defaultTestUser.email);

            const loginResp = await router.testUnauthedRequest<LoginResult>("/v2/user/login", "POST", {
                email: testUtils.defaultTestUser.email,
                password: testUtils.defaultTestUser.password
            });
            chai.assert.equal(loginResp.statusCode, cassava.httpStatusCode.redirect.FOUND);
            chai.assert.equal(loginResp.body.messageCode, "MfaAuthRequired");

            const wrongCodeLoginCompleteResp = await router.testPostLoginRequest(loginResp, "/v2/user/login/mfa", "POST", {
                code: "123456"
            });
            chai.assert.equal(wrongCodeLoginCompleteResp.statusCode, cassava.httpStatusCode.clientError.UNAUTHORIZED);

            const loginCompleteResp = await router.testPostLoginRequest(loginResp, "/v2/user/login/mfa", "POST", {
                code: await generateSkewedOtpCode(secret, -2000)
            });
            chai.assert.equal(loginCompleteResp.statusCode, cassava.httpStatusCode.redirect.FOUND);
            await assertFullyLoggedIn(loginCompleteResp);
        });

        it("can complete login with a 30-second-old code", async () => {
            const secret = await testUtils.enableTotpMfa(testUtils.defaultTestUser.email);

            const loginResp = await router.testUnauthedRequest("/v2/user/login", "POST", {
                email: testUtils.defaultTestUser.email,
                password: testUtils.defaultTestUser.password
            });
            chai.assert.equal(loginResp.statusCode, cassava.httpStatusCode.redirect.FOUND);

            const loginCompleteResp = await router.testPostLoginRequest(loginResp, "/v2/user/login/mfa", "POST", {
                code: await generateSkewedOtpCode(secret, -30000)
            });
            chai.assert.equal(loginCompleteResp.statusCode, cassava.httpStatusCode.redirect.FOUND);
            await assertFullyLoggedIn(loginCompleteResp);
        });

        it("cannot complete with a 60-second-old code", async () => {
            const secret = await testUtils.enableTotpMfa(testUtils.defaultTestUser.email);

            const loginResp = await router.testUnauthedRequest("/v2/user/login", "POST", {
                email: testUtils.defaultTestUser.email,
                password: testUtils.defaultTestUser.password
            });
            chai.assert.equal(loginResp.statusCode, cassava.httpStatusCode.redirect.FOUND);

            const loginCompleteResp = await router.testPostLoginRequest(loginResp, "/v2/user/login/mfa", "POST", {
                code: await generateSkewedOtpCode(secret, -60001)
            });
            chai.assert.equal(loginCompleteResp.statusCode, cassava.httpStatusCode.clientError.UNAUTHORIZED);
        });

        it("does not allow reusing a code even if it was valid", async () => {
            const secret = await testUtils.enableTotpMfa(testUtils.defaultTestUser.email);

            const loginResp = await router.testUnauthedRequest("/v2/user/login", "POST", {
                email: testUtils.defaultTestUser.email,
                password: testUtils.defaultTestUser.password
            });
            chai.assert.equal(loginResp.statusCode, cassava.httpStatusCode.redirect.FOUND);

            const code = await generateSkewedOtpCode(secret, -2000);
            const loginCompleteResp = await router.testPostLoginRequest(loginResp, "/v2/user/login/mfa", "POST", {
                code: code
            });
            chai.assert.equal(loginCompleteResp.statusCode, cassava.httpStatusCode.redirect.FOUND);
            await assertFullyLoggedIn(loginCompleteResp);

            const loginAgainResp = await router.testUnauthedRequest("/v2/user/login", "POST", {
                email: testUtils.defaultTestUser.email,
                password: testUtils.defaultTestUser.password
            });
            chai.assert.equal(loginAgainResp.statusCode, cassava.httpStatusCode.redirect.FOUND);

            const loginAgainCompleteResp = await router.testPostLoginRequest(loginResp, "/v2/user/login/mfa", "POST", {
                code: code
            });
            chai.assert.equal(loginAgainCompleteResp.statusCode, cassava.httpStatusCode.clientError.UNAUTHORIZED);
            await assertNotFullyLoggedIn(loginAgainCompleteResp);
        });
    });

    describe("backup code login", () => {
        it("can complete login with a backup code", async () => {
            await testUtils.enableSmsMfa(testUtils.defaultTestUser.email);
            sinonSandbox.stub(smsUtils, "sendSms")
                .callsFake(async params => {
                });

            const backupCodesResp = await router.testWebAppRequest<string[]>("/v2/user/mfa/backupCodes", "GET");
            chai.assert.equal(backupCodesResp.statusCode, cassava.httpStatusCode.success.OK);

            const loginResp = await router.testUnauthedRequest("/v2/user/login", "POST", {
                email: testUtils.defaultTestUser.email,
                password: testUtils.defaultTestUser.password
            });
            chai.assert.equal(loginResp.statusCode, cassava.httpStatusCode.redirect.FOUND);

            const loginCompleteResp = await router.testPostLoginRequest(loginResp, "/v2/user/login/mfa", "POST", {
                code: backupCodesResp.body[0]
            });
            chai.assert.equal(loginCompleteResp.statusCode, cassava.httpStatusCode.redirect.FOUND);
            chai.assert.isString(loginCompleteResp.headers["Location"]);
            chai.assert.isString(loginCompleteResp.headers["Set-Cookie"]);
            chai.assert.match(loginCompleteResp.headers["Set-Cookie"], /gb_jwt_session=([^ ;]+)/);
            chai.assert.match(loginCompleteResp.headers["Set-Cookie"], /gb_jwt_signature=([^ ;]+)/);

            await assertFullyLoggedIn(loginCompleteResp);
        });

        it("cannot use the same backup code twice", async () => {
            await testUtils.enableSmsMfa(testUtils.defaultTestUser.email);
            sinonSandbox.stub(smsUtils, "sendSms")
                .callsFake(async params => {
                });

            const backupCodesResp = await router.testWebAppRequest<string[]>("/v2/user/mfa/backupCodes", "GET");
            chai.assert.equal(backupCodesResp.statusCode, cassava.httpStatusCode.success.OK);

            const loginResp = await router.testUnauthedRequest("/v2/user/login", "POST", {
                email: testUtils.defaultTestUser.email,
                password: testUtils.defaultTestUser.password
            });
            chai.assert.equal(loginResp.statusCode, cassava.httpStatusCode.redirect.FOUND);

            const loginCompleteResp = await router.testPostLoginRequest(loginResp, "/v2/user/login/mfa", "POST", {
                code: backupCodesResp.body[0]
            });
            chai.assert.equal(loginCompleteResp.statusCode, cassava.httpStatusCode.redirect.FOUND);

            const login2Resp = await router.testUnauthedRequest("/v2/user/login", "POST", {
                email: testUtils.defaultTestUser.email,
                password: testUtils.defaultTestUser.password
            });
            chai.assert.equal(login2Resp.statusCode, cassava.httpStatusCode.redirect.FOUND);

            const login2CompleteResp = await router.testPostLoginRequest(login2Resp, "/v2/user/login/mfa", "POST", {
                code: backupCodesResp.body[0]
            });
            chai.assert.equal(login2CompleteResp.statusCode, cassava.httpStatusCode.clientError.UNAUTHORIZED);
        });
    });

    describe("trust this device", () => {
        it("allows skipping the MFA step with the correct token", async () => {
            await testUtils.enableSmsMfa(testUtils.defaultTestUser.email);
            let sms: smsUtils.SendSmsParams;
            sinonSandbox.stub(smsUtils, "sendSms")
                .onFirstCall()
                .callsFake(async params => {
                    sms = params;
                });

            const firstLoginResp = await router.testUnauthedRequest("/v2/user/login", "POST", {
                email: testUtils.defaultTestUser.email,
                password: testUtils.defaultTestUser.password
            });
            chai.assert.equal(firstLoginResp.statusCode, cassava.httpStatusCode.redirect.FOUND);

            const code = /\b([A-Z0-9]{6})\b/.exec(sms.body)[1];
            chai.assert.isString(code);

            const loginCompleteResp = await router.testPostLoginRequest(firstLoginResp, "/v2/user/login/mfa", "POST", {
                code: code,
                trustThisDevice: true
            });
            chai.assert.equal(loginCompleteResp.statusCode, cassava.httpStatusCode.redirect.FOUND);
            chai.assert.isString(loginCompleteResp.headers["Set-Cookie"]);
            chai.assert.match(loginCompleteResp.headers["Set-Cookie"], /gb_ttd=([^ ;]+)/);

            const ttdToken = /gb_ttd=([^ ;]+)/.exec(loginCompleteResp.headers["Set-Cookie"])[1];
            chai.assert.isString(ttdToken);

            const badTtdTokenLoginResp = await router.testUnauthedRequest("/v2/user/login", "POST",
                {
                    email: testUtils.defaultTestUser.email,
                    password: testUtils.defaultTestUser.password
                },
                {
                    Cookie: "gb_ttd=asdfasdfasdfasdf"
                }
            );
            chai.assert.equal(badTtdTokenLoginResp.statusCode, cassava.httpStatusCode.redirect.FOUND);
            await assertNotFullyLoggedIn(badTtdTokenLoginResp);

            const goodTtdTokenLoginResp = await router.testUnauthedRequest("/v2/user/login", "POST",
                {
                    email: testUtils.defaultTestUser.email,
                    password: testUtils.defaultTestUser.password
                },
                {
                    Cookie: `gb_ttd=${ttdToken}`
                }
            );
            chai.assert.equal(goodTtdTokenLoginResp.statusCode, cassava.httpStatusCode.redirect.FOUND);
            await assertFullyLoggedIn(goodTtdTokenLoginResp);
        });

        it("expires trusted devices even if they have the correct token", async () => {
            await testUtils.enableSmsMfa(testUtils.defaultTestUser.email);
            let sms: smsUtils.SendSmsParams;
            sinonSandbox.stub(smsUtils, "sendSms")
                .onFirstCall()
                .callsFake(async params => {
                    sms = params;
                });

            const firstLoginResp = await router.testUnauthedRequest("/v2/user/login", "POST", {
                email: testUtils.defaultTestUser.email,
                password: testUtils.defaultTestUser.password
            });
            chai.assert.equal(firstLoginResp.statusCode, cassava.httpStatusCode.redirect.FOUND);

            const enableSmsMfaCode = /\b([A-Z0-9]{6})\b/.exec(sms.body)[1];
            chai.assert.isString(enableSmsMfaCode);

            const loginCompleteResp = await router.testPostLoginRequest(firstLoginResp, "/v2/user/login/mfa", "POST", {
                code: enableSmsMfaCode,
                trustThisDevice: true
            });
            chai.assert.equal(loginCompleteResp.statusCode, cassava.httpStatusCode.redirect.FOUND);
            chai.assert.isString(loginCompleteResp.headers["Set-Cookie"]);
            chai.assert.match(loginCompleteResp.headers["Set-Cookie"], /gb_ttd=([^ ;]+)/);

            const ttdToken = /gb_ttd=([^ ;]+)/.exec(loginCompleteResp.headers["Set-Cookie"])[1];
            chai.assert.isString(ttdToken);

            // Manually adjust DB to expire token
            const userLogin = await DbUserLogin.get(testUtils.defaultTestUser.email);
            chai.assert.isDefined(userLogin.mfa.trustedDevices[ttdToken]);
            userLogin.mfa.trustedDevices[ttdToken].expiresDate = new Date(Date.now() - 1000).toISOString();
            await DbUserLogin.update(userLogin, {
                action: "put",
                attribute: "mfa",
                value: userLogin.mfa
            });

            const secondLoginResp = await router.testUnauthedRequest("/v2/user/login", "POST",
                {
                    email: testUtils.defaultTestUser.email,
                    password: testUtils.defaultTestUser.password
                },
                {
                    Cookie: `gb_ttd=${ttdToken}`
                });
            chai.assert.equal(firstLoginResp.statusCode, cassava.httpStatusCode.redirect.FOUND);
            await assertNotFullyLoggedIn(secondLoginResp);
        });

        it("forgets trusted devices when MFA is disabled and re-enabled", async () => {
            await testUtils.enableSmsMfa(testUtils.defaultTestUser.email);
            let sms: smsUtils.SendSmsParams;
            sinonSandbox.stub(smsUtils, "sendSms")
                .onFirstCall()
                .callsFake(async params => {
                    sms = params;
                });

            const firstLoginResp = await router.testUnauthedRequest("/v2/user/login", "POST", {
                email: testUtils.defaultTestUser.email,
                password: testUtils.defaultTestUser.password
            });
            chai.assert.equal(firstLoginResp.statusCode, cassava.httpStatusCode.redirect.FOUND);

            const code = /\b([A-Z0-9]{6})\b/.exec(sms.body)[1];
            chai.assert.isString(code);

            const loginCompleteResp = await router.testPostLoginRequest(firstLoginResp, "/v2/user/login/mfa", "POST", {
                code: code,
                trustThisDevice: true
            });
            chai.assert.equal(loginCompleteResp.statusCode, cassava.httpStatusCode.redirect.FOUND);
            chai.assert.isString(loginCompleteResp.headers["Set-Cookie"]);
            chai.assert.match(loginCompleteResp.headers["Set-Cookie"], /gb_ttd=([^ ;]+)/);

            const ttdToken = /gb_ttd=([^ ;]+)/.exec(loginCompleteResp.headers["Set-Cookie"])[1];
            chai.assert.isString(ttdToken);

            const disableMfaResp = await router.testPostLoginRequest(loginCompleteResp, "/v2/user/mfa", "DELETE");
            chai.assert.equal(disableMfaResp.statusCode, cassava.httpStatusCode.success.OK);

            await testUtils.enableSmsMfa(testUtils.defaultTestUser.email);

            const secondLoginResp = await router.testUnauthedRequest("/v2/user/login", "POST",
                {
                    email: testUtils.defaultTestUser.email,
                    password: testUtils.defaultTestUser.password
                },
                {
                    Cookie: `gb_ttd=${ttdToken}`
                });
            chai.assert.equal(firstLoginResp.statusCode, cassava.httpStatusCode.redirect.FOUND);
            await assertNotFullyLoggedIn(secondLoginResp);
        });
    });
});
