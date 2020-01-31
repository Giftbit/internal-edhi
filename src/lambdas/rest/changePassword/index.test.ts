import * as chai from "chai";
import * as cassava from "cassava";
import * as testUtils from "../../../utils/testUtils";
import {generateId} from "../../../utils/testUtils";
import {TestRouter} from "../../../utils/testUtils/TestRouter";
import {installUnauthedRestRoutes} from "../installUnauthedRestRoutes";
import {installAuthedRestRoutes} from "../installAuthedRestRoutes";
import {DbUserLogin} from "../../../db/DbUserLogin";

describe("/v2/user/changePassword", () => {

    const router = new TestRouter();

    before(() => {
        installUnauthedRestRoutes(router);
        router.route(testUtils.authRoute);
        installAuthedRestRoutes(router);
        DbUserLogin.initializeBadgeSigningSecrets(Promise.resolve({secretkey: "secret"}));
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
            email: testUtils.defaultTestUser.userLogin.email,
            password: testUtils.defaultTestUser.password
        });
        chai.assert.equal(oldPasswordLoginResp.statusCode, cassava.httpStatusCode.clientError.UNAUTHORIZED);

        const newPasswordLoginResp = await router.testUnauthedRequest("/v2/user/login", "POST", {
            email: testUtils.defaultTestUser.userLogin.email,
            password: newPassword
        });
        chai.assert.equal(newPasswordLoginResp.statusCode, cassava.httpStatusCode.redirect.FOUND);
        chai.assert.isString(newPasswordLoginResp.headers["Set-Cookie"]);
        chai.assert.match(newPasswordLoginResp.headers["Set-Cookie"], /gb_jwt_session=([^ ;]+)/);
        chai.assert.match(newPasswordLoginResp.headers["Set-Cookie"], /gb_jwt_signature=([^ ;]+)/);
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
        const newPassword = generateId().substring(0, 8);
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

    it("requires the oldPassword to validate", async () => {
        const newPassword = generateId();
        const changePasswordResp = await router.testWebAppRequest("/v2/user/changePassword", "POST", {
            oldPassword: generateId(),
            newPassword: generateId()
        });
        chai.assert.equal(changePasswordResp.statusCode, cassava.httpStatusCode.clientError.CONFLICT);
    });
});
