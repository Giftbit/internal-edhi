import otplib = require("otplib");
import otplibCore = require("otplib/core");

/**
 * The number of time steps that a token generated from
 * should be considered valid.  A time step is 30 seconds.
 */
const validationWindow = 1;

export function generateOtpSecret(): string {
    return otplib.authenticator.generateSecret();
}

export function validateOtpCode(secret: string, code: string): boolean {
    otplib.authenticator.options = {
        window: validationWindow
    };
    return otplib.authenticator.check(code, secret);
}

/**
 * Generate an OTP code from a time step in the past or future.
 * This is most useful in testing so we don't have to wait
 * to test valid consecutive codes.
 */
export function generateSkewedOtpCode(secret: string, skewMilliSeconds: number): string {
    return otplibCore.totpToken(otplib.authenticator.decode(secret), {
        ...otplib.authenticator.optionsAll,
        epoch: Date.now() + skewMilliSeconds
    });
}
