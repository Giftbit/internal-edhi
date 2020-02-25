import * as testUtils from "./testUtils";
import * as chai from "chai";
import * as crypto from "crypto";
import {initializeIntercomSecrets} from "./intercomUtils";
import {hashIntercomUserId} from "./intercomUtils";

describe("intercomUtils", () => {
    const testSecret = "TERST_SECRET";

    before(async () => {
        await initializeIntercomSecrets(Promise.resolve({
            secretKey: testSecret
        }));
    });

    describe("hashUserId(userId)", () => {
        it("generates the expected hash", async () => {
            const hashedUserId = await hashIntercomUserId(testUtils.defaultTestUser.userId);
            const expectedOutput = crypto.createHmac("sha256", testSecret)
                .update(testUtils.defaultTestUser.userId)
                .digest("hex");

            chai.assert.equal(expectedOutput, hashedUserId);
        });
    });
});
