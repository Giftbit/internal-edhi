import * as chai from "chai";
import * as crypto from "crypto";
import * as testUtils from "./testUtils";
import {decryptSecret, encryptSecret, generateTotpSecret, initializeEncryptionSecret} from "./secretsUtils";

describe("secretsUtils", () => {
    before(() => {
        initializeEncryptionSecret(Promise.resolve(crypto.randomBytes(32).toString("hex")));
    });

    it("encrypts and decrypts a secret", async () => {
        const secret = testUtils.generateId();

        const encrypted = await encryptSecret(secret);
        chai.assert.isString(encrypted);
        chai.assert.notEqual(encrypted, secret);

        const decrypted = await decryptSecret(encrypted);
        chai.assert.isString(decrypted);
        chai.assert.notEqual(decrypted, encrypted);
        chai.assert.equal(decrypted, secret);
    });

    describe("generateTotpSecret()", () => {
        it("generates a base32 secret", async () => {
            const secret = await generateTotpSecret();
            chai.assert.match(secret.totpSecret, /^[ABCDEFGHIJKLMNOPQRSTUVWXYZ234567]{16}$/);
        });

        it("generates a secret that can be decrypted", async () => {
            const secret = await generateTotpSecret();
            const decryptedTotpSecret = await decryptSecret(secret.encryptedTotpSecret);
            chai.assert.equal(decryptedTotpSecret, secret.totpSecret);
        })
    });
});
