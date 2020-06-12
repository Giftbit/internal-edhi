import * as chai from "chai";
import * as cassava from "cassava";
import * as testUtils from "../../../utils/testUtils";
import {generateId} from "../../../utils/testUtils";
import {TestRouter} from "../../../utils/testUtils/TestRouter";
import {installUnauthedRestRoutes} from "../installUnauthedRestRoutes";
import {installAuthedRestRoutes} from "../installAuthedRestRoutes";
import {DbUser} from "../../../db/DbUser";
import {DbUserPasswordHistory} from "../../../db/DbUserPasswordHistory";

describe("/v2/user/changePassword", () => {

    const router = new TestRouter();

    before(() => {
        installUnauthedRestRoutes(router);
        router.route(testUtils.authRoute);
        installAuthedRestRoutes(router);
        DbUser.initializeBadgeSigningSecrets(Promise.resolve({secretkey: "secret"}));
    });

    beforeEach(async () => {
        // Reset user password to known state.
        await testUtils.resetDb();
    });

    it("can change the password", async () => {
        const newPassword = generateId();
        const changePasswordResp = await router.testWebAppRequest("/v2/user/changePassword", "POST", {
            oldPassword: testUtils.defaultTestUser.password,
            newPassword
        });
        chai.assert.equal(changePasswordResp.statusCode, cassava.httpStatusCode.success.OK, changePasswordResp.bodyRaw);

        // Cannot log in with the old password.
        const oldPasswordLoginResp = await router.testUnauthedRequest("/v2/user/login", "POST", {
            email: testUtils.defaultTestUser.user.email,
            password: testUtils.defaultTestUser.password
        });
        chai.assert.equal(oldPasswordLoginResp.statusCode, cassava.httpStatusCode.clientError.UNAUTHORIZED);

        const newPasswordLoginResp = await router.testUnauthedRequest("/v2/user/login", "POST", {
            email: testUtils.defaultTestUser.user.email,
            password: newPassword
        });
        chai.assert.equal(newPasswordLoginResp.statusCode, cassava.httpStatusCode.success.OK);
        chai.assert.isString(newPasswordLoginResp.getCookie("gb_jwt_session"));
        chai.assert.isString(newPasswordLoginResp.getCookie("gb_jwt_signature"));

    });

    it("rejects an empty password", async () => {
        const changePasswordResp = await router.testWebAppRequest("/v2/user/changePassword", "POST", {
            oldPassword: testUtils.defaultTestUser.password,
            newPassword: ""
        });
        chai.assert.equal(changePasswordResp.statusCode, cassava.httpStatusCode.clientError.UNPROCESSABLE_ENTITY);
    });

    it("rejects a password of 7 characters or less", async () => {
        const newPassword = generateId().substring(0, 7);
        const changePasswordResp = await router.testWebAppRequest("/v2/user/changePassword", "POST", {
            oldPassword: testUtils.defaultTestUser.password,
            newPassword: newPassword
        });
        chai.assert.equal(changePasswordResp.statusCode, cassava.httpStatusCode.clientError.UNPROCESSABLE_ENTITY);
    });

    it("accepts a password of 8 characters", async () => {
        const newPassword = generateId().substring(0, 5) + "a0_";
        const changePasswordResp = await router.testWebAppRequest("/v2/user/changePassword", "POST", {
            oldPassword: testUtils.defaultTestUser.password,
            newPassword
        });
        chai.assert.equal(changePasswordResp.statusCode, cassava.httpStatusCode.success.OK, changePasswordResp.bodyRaw);
    });

    it("rejects a password of 256 characters or more", async () => {
        const newPassword = "Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in";
        chai.assert.lengthOf(newPassword, 256);
        const changePasswordResp = await router.testWebAppRequest("/v2/user/changePassword", "POST", {
            oldPassword: testUtils.defaultTestUser.password,
            newPassword: newPassword
        });
        chai.assert.equal(changePasswordResp.statusCode, cassava.httpStatusCode.clientError.UNPROCESSABLE_ENTITY);
    });

    it("accepts a password of 255 characters", async () => {
        const newPassword = "Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor i";
        chai.assert.lengthOf(newPassword, 255);
        const changePasswordResp = await router.testWebAppRequest("/v2/user/changePassword", "POST", {
            oldPassword: testUtils.defaultTestUser.password,
            newPassword: newPassword
        });
        chai.assert.equal(changePasswordResp.statusCode, cassava.httpStatusCode.success.OK);
    });

    it("rejects a password of only numbers", async () => {
        const changePasswordResp = await router.testWebAppRequest("/v2/user/changePassword", "POST", {
            oldPassword: testUtils.defaultTestUser.password,
            newPassword: "1234567654321"
        });
        chai.assert.equal(changePasswordResp.statusCode, cassava.httpStatusCode.clientError.UNPROCESSABLE_ENTITY);
    });

    it("rejects a very common password", async () => {
        const changePasswordResp = await router.testWebAppRequest("/v2/user/changePassword", "POST", {
            oldPassword: testUtils.defaultTestUser.password,
            newPassword: "midnight"
        });
        chai.assert.equal(changePasswordResp.statusCode, cassava.httpStatusCode.clientError.UNPROCESSABLE_ENTITY);
    });

    it("requires the oldPassword to validate", async () => {
        const changePasswordResp = await router.testWebAppRequest("/v2/user/changePassword", "POST", {
            oldPassword: generateId(),
            newPassword: generateId()
        });
        chai.assert.equal(changePasswordResp.statusCode, cassava.httpStatusCode.clientError.CONFLICT);
    });

    it("requires that users cannot reuse the last password when changing passwords", async () => {
        const changePasswordResp = await router.testWebAppRequest<any>("/v2/user/changePassword", "POST", {
            oldPassword: testUtils.defaultTestUser.password,
            newPassword: testUtils.defaultTestUser.password
        });
        chai.assert.equal(changePasswordResp.statusCode, cassava.httpStatusCode.clientError.CONFLICT, changePasswordResp.bodyRaw);
        chai.assert.equal(changePasswordResp.body.messageCode, "ReusedPassword");
    });

    it("requires that users in the Account cannot reuse a recent password when changing passwords", async () => {
        const passwordHistoryPasswords = Array(DbUserPasswordHistory.maxPasswordHistoryLength + 1).fill(0).map(() => generateId());

        for (let passwordIx = 0; passwordIx < passwordHistoryPasswords.length; passwordIx++) {
            const changePasswordResp = await router.testWebAppRequest("/v2/user/changePassword", "POST", {
                oldPassword: passwordIx === 0 ? testUtils.defaultTestUser.password : passwordHistoryPasswords[passwordIx - 1],
                newPassword: passwordHistoryPasswords[passwordIx]
            });
            chai.assert.equal(changePasswordResp.statusCode, cassava.httpStatusCode.success.OK, `Password ix=${passwordIx} password=${passwordHistoryPasswords[passwordIx]} should be able to change, response=${changePasswordResp.bodyRaw}`);

            // For all but the last password it should be impossible to change back to the original.
            if (passwordIx < passwordHistoryPasswords.length - 1) {
                const changePasswordBackFailResp = await router.testWebAppRequest<any>("/v2/user/changePassword", "POST", {
                    oldPassword: passwordHistoryPasswords[passwordIx],
                    newPassword: testUtils.defaultTestUser.password
                });
                chai.assert.equal(changePasswordBackFailResp.statusCode, cassava.httpStatusCode.clientError.CONFLICT, `Password ix=${passwordIx} should not be changed back to default, response=${changePasswordResp.bodyRaw}`);
                chai.assert.equal(changePasswordBackFailResp.body.messageCode, "ReusedPassword", `Password ix=${passwordIx} should not be changed back to default, response=${changePasswordResp.bodyRaw}`);
            } else {
                const changePasswordBackSuccessResp = await router.testWebAppRequest<any>("/v2/user/changePassword", "POST", {
                    oldPassword: passwordHistoryPasswords[passwordIx],
                    newPassword: testUtils.defaultTestUser.password
                });
                chai.assert.equal(changePasswordBackSuccessResp.statusCode, cassava.httpStatusCode.success.OK, `Password ix=${passwordIx} should change back to default, response=${changePasswordResp.bodyRaw}`);
            }
        }
    }).timeout(30000);  // Validating passwords takes a long time and this test does *a lot* of that.
});
