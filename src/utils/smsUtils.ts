import * as cassava from "cassava";
import * as giftbitRoutes from "giftbit-cassava-routes";
import * as twilio from "twilio";
import log = require("loglevel");

export interface TwilioCredentialsConfig {
    live: TwilioModeCredentials;
    test: TwilioModeCredentials;
}

export interface TwilioModeCredentials {
    accountSid: string;
    authToken: string;
    phoneNumber: string;
}

let twilioCredentialsPromise: Promise<TwilioCredentialsConfig>;

export function initializeTwilioCredentials(config: Promise<TwilioCredentialsConfig>): void {
    twilioCredentialsPromise = config;
}

export interface SendSmsParams {
    to: string;
    body: string;
}

// see https://github.com/Giftbit/giftbit-smslib
// If this logic becomes useful in another service we should refactor into a library.

export async function sendSms(params: SendSmsParams): Promise<void> {
    if (!twilioCredentialsPromise) {
        throw new Error("Twilio credentials not set.");
    }

    const twilioCredentials = await twilioCredentialsPromise;
    const twilioClient = twilio(twilioCredentials.live.accountSid, twilioCredentials.live.authToken);

    log.info("Sending SMS to ", params.to, ":", params.body);

    try {
        const res = await twilioClient.messages.create({
            body: params.body,
            to: sanitizePhoneNumber(params.to),
            from: twilioCredentials.live.phoneNumber
        });
        log.info("SMS sent", res.sid);
    } catch (error) {
        log.error("Error sending SMS to", params.to, "code=", error.code, "message=", error.message);
        throw new giftbitRoutes.GiftbitRestError(cassava.httpStatusCode.clientError.UNPROCESSABLE_ENTITY, getTwilioErrorCodeMessage(error.code));
    }
}

/**
 * Get an error message from the Twilio error code we can show users.
 * Twilio error messages are written from our perspective and would
 * confused our users.  eg: "The 'To' number 15555555555 is not a valid phone number."
 */
function getTwilioErrorCodeMessage(code: number): string {
    switch (code) {
        case 21211:
            return "The phone number submitted is not a valid phone number.";
        case 21612:
            return "The phone number submitted is not currently reachable via SMS.";
        case 21408:
            return "The phone number submitted is not in a reachable region to receive SMS messages.";
        case 21614:
            return "The phone number submitted is incapable of receiving SMS messages.";
        default:
            return "An unknown error occurred when trying to send SMS. Please try again later.";
    }
}

function sanitizePhoneNumber(phoneNumber: string): string {
    return phoneNumber.replace(/[. \-\(\)]/g, "");
}
