import * as crypto from "crypto";
import otplib = require("otplib");
import otplibCore = require("otplib/core");

/**
 * The number of time steps that a token generated from
 * should be considered valid.  A time step is 30 seconds.
 */
const validationWindow = 1;

let otpEncryptionSecrets: Promise<{ key: string }> = null;

export function initializeOtpEncryptionSecrets(secrets: Promise<{ key: string }>): void {
    otpEncryptionSecrets = secrets;
}

export async function encryptOtpSecret(secret: string): Promise<string> {
    if (!otpEncryptionSecrets) {
        throw new Error("otpEncryptionSecrets has not been initialized.");
    }
    const secrets = await otpEncryptionSecrets;

    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv("aes-256-ctr", Buffer.from(secrets.key, "hex"), iv);
    let encrypted = cipher.update(secret, "utf8", "hex");
    encrypted += cipher.final("hex");
    return iv.toString("hex") + ":" + encrypted;
}

export async function decryptOtpSecret(encryptedSecret: string): Promise<string> {
    if (!otpEncryptionSecrets) {
        throw new Error("otpEncryptionSecrets has not been initialized.");
    }
    const secrets = await otpEncryptionSecrets;

    const encryptedParts = encryptedSecret.split(":", 2);
    if (encryptedParts.length !== 2) {
        throw new Error("Secret is not properly encoded.  Expected ':'.");
    }

    const iv = Buffer.from(encryptedParts[0], "hex");
    const decipher = crypto.createDecipheriv("aes-256-ctr", Buffer.from(secrets.key, "hex"), iv);

    let decrypted = decipher.update(Buffer.from(encryptedParts[1], "hex"), "hex", "utf8");
    decrypted += decipher.final("utf8");

    return decrypted;
}

export async function generateOtpSecret(): Promise<string> {
    return await encryptOtpSecret(otplib.authenticator.generateSecret());
}

export namespace generateOtpSecret {

}

export async function validateOtpCode(secret: string, code: string): Promise<boolean> {
    otplib.authenticator.options = {
        window: validationWindow
    };
    return otplib.authenticator.check(code, await decryptOtpSecret(secret));
}

/**
 * Generate an OTP code from a time step in the past or future.
 * This is most useful in testing so we don't have to wait
 * to test valid consecutive codes.
 */
export async function generateSkewedOtpCode(secret: string, skewMilliSeconds: number): Promise<string> {
    return otplibCore.totpToken(otplib.authenticator.decode(await decryptOtpSecret(secret)), {
        ...otplib.authenticator.optionsAll,
        epoch: Date.now() + skewMilliSeconds
    });
}
