import * as cassava from "cassava";
import * as chai from "chai";
import * as sinon from "sinon";
import * as emailUtils from "../../../utils/emailUtils";
import * as testUtils from "../../../utils/testUtils";
import {installUnauthedRestRoutes} from "../installUnauthedRestRoutes";
import {TestRouter} from "../../../utils/testUtils/TestRouter";
import {SendEmailParams} from "../../../utils/emailUtils";
import {generateId} from "../../../utils/testUtils";

describe("registration", () => {

    const router = new TestRouter();
    const sinonSandbox = sinon.createSandbox();

    before(async () => {
        await testUtils.resetDb();
        installUnauthedRestRoutes(router);
    });

    afterEach(() => {
        sinon.restore();
    });

    it("can register a new user, send an email, verify email, log in", async () => {
        let verifyUrl: string;
        const sendEmailStub = sinonSandbox.stub(emailUtils, "sendEmail")
            .callsFake(async (params: SendEmailParams) => {
                const verifyEmailMatcher = /(https:\/\/[a-z.]+\/v2\/user\/register\/verifyEmail\?token=[a-zA-Z0-9]*)/.exec(params.body);
                verifyUrl = verifyEmailMatcher[1];
                return null;
            });

        const username = generateId();
        const password = generateId();
        const registerResp = await router.testRequest<any>("/v2/user/register", "POST", {
            username,
            password
        });
        chai.assert.equal(registerResp.statusCode, cassava.httpStatusCode.success.CREATED);
        chai.assert.isString(verifyUrl, "Found verify url in email body.");

        const token = /\/v2\/user\/register\/verifyEmail\?token=(.*)/.exec(verifyUrl)[1];
        const verifyResp = await router.testRequest<any>(`/v2/user/register/verifyEmail?token=${token}`, "GET");
        chai.assert.equal(verifyResp.statusCode, cassava.httpStatusCode.redirect.FOUND);
        chai.assert.isString(verifyResp.headers["Location"]);

        // TODO login
    });

    it("will not verifyEmail with a bad token", async () => {
        const resp = await router.testRequest<any>("/v2/user/register/verifyEmail?token=asdfasdfasdf", "GET");
        chai.assert.equal(resp.statusCode, cassava.httpStatusCode.clientError.CONFLICT);
    });
});

