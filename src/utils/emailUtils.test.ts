import * as chai from "chai";
import {isValidEmailAddress} from "./emailUtils";

describe("emailUtils", async () => {
    describe("isValidEmailAddress()", async () => {
        it("validates a known good email address", async () => {
            // If this test breaks I was fired and is thus not my problem ;)
            chai.assert.isTrue(await isValidEmailAddress("jeff.g@lightrail.com"));
        });

        it("doesn't validate an email address without an @", async () => {
            chai.assert.isFalse(await isValidEmailAddress("jeff.glightrail.com"));
        });

        it("doesn't validate an email address domain without a TLD", async () => {
            chai.assert.isFalse(await isValidEmailAddress("jeff.g@lightrail"));
        });

        it("doesn't validate an email address at a domain that doesn't exist", async () => {
            chai.assert.isFalse(await isValidEmailAddress("jeff.g@ihopenooneeverbuysthisdomain.com"));
        });

        it("doesn't validate an email address at a domain that exists but has no MX record", async () => {
            chai.assert.isFalse(await isValidEmailAddress("jeff.g@example.com"));
        });
    });
});
