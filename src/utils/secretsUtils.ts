import * as crypto from "crypto";
import otplib = require("otplib");
import otplibCore = require("otplib/core");

/**
 * The number of time steps that a token generated from
 * should be considered valid.  A time step is 30 seconds.
 */
const totpValidationWindow = 1;

let encryptionSecret: Promise<string> = null;

export function initializeEncryptionSecret(secret: Promise<string>): void {
    encryptionSecret = secret;
}

async function getEncryptionSecretBuffer(): Promise<Buffer> {
    if (!encryptionSecret) {
        throw new Error("encryptionSecret has not been initialized.");
    }
    const hexString = await encryptionSecret;
    if (!/^[0-9A-Fa-f]{64}$/.test(hexString)) {
        throw new Error("encryptionSecret is not a 32-byte hex string");
    }
    return Buffer.from(hexString, "hex");
}

export async function encryptSecret(secret: string): Promise<string> {
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv("aes-256-ctr", await getEncryptionSecretBuffer(), iv);
    let encrypted = cipher.update(secret, "utf8", "hex");
    encrypted += cipher.final("hex");
    return iv.toString("hex") + ":" + encrypted;
}

export async function decryptSecret(encryptedSecret: string): Promise<string> {
    const encryptedParts = encryptedSecret.split(":", 2);
    if (encryptedParts.length !== 2) {
        throw new Error("Secret is not properly encoded.  Expected ':'.");
    }

    const iv = Buffer.from(encryptedParts[0], "hex");
    const decipher = crypto.createDecipheriv("aes-256-ctr", await getEncryptionSecretBuffer(), iv);

    let decrypted = decipher.update(Buffer.from(encryptedParts[1], "hex"), "hex", "utf8");
    decrypted += decipher.final("utf8");

    return decrypted;
}

export async function generateTotpSecret(): Promise<{ totpSecret: string, encryptedTotpSecret: string }> {
    const totpSecret = otplib.authenticator.generateSecret();
    const encryptedTotpSecret = await encryptSecret(totpSecret);
    return {
        totpSecret: totpSecret,
        encryptedTotpSecret: encryptedTotpSecret
    };
}

export async function validateTotpCode(encryptedTotpSecret: string, code: string): Promise<boolean> {
    otplib.authenticator.options = {
        window: totpValidationWindow
    };
    return otplib.authenticator.check(code, await decryptSecret(encryptedTotpSecret));
}

/**
 * Generate an OTP code from a time step in the past or future.
 * This is most useful in testing so we don't have to wait
 * to test valid consecutive codes.
 */
export async function generateSkewedOtpCode(totpSecret: string, skewMilliSeconds: number): Promise<string> {
    return otplibCore.totpToken(otplib.authenticator.decode(totpSecret), {
        ...otplib.authenticator.allOptions(),
        epoch: Date.now() + skewMilliSeconds
    });
}
