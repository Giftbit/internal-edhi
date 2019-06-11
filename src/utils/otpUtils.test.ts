import * as chai from "chai";
import * as crypto from "crypto";
import {decryptOtpSecret, encryptOtpSecret, generateOtpSecret, initializeOtpEncryptionSecrets} from "./otpUtils";

describe("otpUtils", () => {
    before(() => {
        initializeOtpEncryptionSecrets(Promise.resolve({key: crypto.randomBytes(32).toString("hex")}));
    });

    describe("initializeOtpEncryptionSecrets()", () => {
        it("encrypts and decrypts a secret", async () => {
            const secret = await generateOtpSecret();

            const encrypted = await encryptOtpSecret(secret);
            chai.assert.isString(encrypted);
            chai.assert.notEqual(encrypted, secret);

            const decrypted = await decryptOtpSecret(encrypted);
            chai.assert.isString(decrypted);
            chai.assert.notEqual(decrypted, encrypted);
            chai.assert.equal(decrypted, secret);
        });
    });
});
