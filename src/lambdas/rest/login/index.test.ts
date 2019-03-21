import * as cassava from "cassava";
import * as chai from "chai";
import * as sinon from "sinon";
import * as testUtils from "../../../utils/testUtils";
import {generateId} from "../../../utils/testUtils";
import {TestRouter} from "../../../utils/testUtils/TestRouter";
import {initializeBadgeSigningSecrets, installLoginRest} from "./index";
import * as emailUtils from "../../../utils/emailUtils";
import {dynamodb, userDynameh} from "../../../dynamodb";

describe("/v2/user/login", () => {

    const router = new TestRouter();
    const sinonSandbox = sinon.createSandbox();

    before(async () => {
        await testUtils.resetDb();
        installLoginRest(router);
        initializeBadgeSigningSecrets(Promise.resolve({secretkey: "secret"}));
    });

    afterEach(() => {
        sinonSandbox.restore();
    });

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

    it("can login the test user", async () => {
        const resp = await router.testUnauthedRequest("/v2/user/login", "POST", {
            email: testUtils.defaultTestUser.user.email,
            password: testUtils.defaultTestUser.password
        });
        chai.assert.equal(resp.statusCode, cassava.httpStatusCode.redirect.FOUND);
        chai.assert.isString(resp.headers["Set-Cookie"]);
        chai.assert.match(resp.headers["Set-Cookie"], /gb_jwt_session=([^ ;]+)/);
        chai.assert.match(resp.headers["Set-Cookie"], /gb_jwt_signature=([^ ;]+)/);
    });

    it("locks the user for an hour after 10 unsuccessful login attempts", async () => {
        let lockedEmail: string;
        sinonSandbox.stub(emailUtils, "sendEmail")
            .callsFake(async (params: emailUtils.SendEmailParams) => {
                lockedEmail = params.textBody;
                return null;
            });

        for (let i = 0; i < 10; i++) {
            const resp = await router.testUnauthedRequest("/v2/user/login", "POST", {
                email: testUtils.defaultTestUser.user.email,
                password: generateId()
            });
            chai.assert.equal(resp.statusCode, cassava.httpStatusCode.clientError.UNAUTHORIZED);
            if (i < 9) {
                chai.assert.isUndefined(lockedEmail, `Did not get locked email on attempt ${i}`);
            } else {
                chai.assert.isString(lockedEmail, "Got locked account warning email after the last attempt.");
            }
        }

        const goodPasswordButLockedResp = await router.testUnauthedRequest("/v2/user/login", "POST", {
            email: testUtils.defaultTestUser.user.email,
            password: testUtils.defaultTestUser.password
        });
        chai.assert.equal(goodPasswordButLockedResp.statusCode, cassava.httpStatusCode.clientError.UNAUTHORIZED);

        // Manually move the lockedUntilDate to over an hour ago.
        const pastLockedDate = new Date();
        pastLockedDate.setMinutes(pastLockedDate.getMinutes() - 65);
        const updateLockedDateReq = userDynameh.requestBuilder.buildUpdateInputFromActions(
            testUtils.defaultTestUser.user,
            {
                action: "put",
                attribute: "lockedUntilDate",
                value: pastLockedDate.toISOString()
            }
        );
        await dynamodb.updateItem(updateLockedDateReq).promise();

        const goodLoginResp = await router.testUnauthedRequest("/v2/user/login", "POST", {
            email: testUtils.defaultTestUser.user.email,
            password: testUtils.defaultTestUser.password
        });
        chai.assert.equal(goodLoginResp.statusCode, cassava.httpStatusCode.redirect.FOUND);
    });
});
