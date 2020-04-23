import Stripe = require("stripe");
import log = require("loglevel");
import * as giftbitRoutes from "giftbit-cassava-routes";

const stripeApiVersion = "2018-05-21";
const stripeClientCache: { [key: string]: Stripe } = {};
let stripeConfigPromise: Promise<giftbitRoutes.secureConfig.StripeConfig>;

export function initializeLightrailStripeConfig(config: Promise<giftbitRoutes.secureConfig.StripeConfig>): void {
    stripeConfigPromise = config;
}

export async function getStripeClient(mode: "test" | "live"): Promise<Stripe> {
    if (!stripeClientCache[mode]) {
        if (process.env["TEST_ENV"]) {
            log.warn("Using unit test Stripe secret key from env");
            stripeClientCache[mode] = new Stripe(process.env["LIGHTRAIL_STRIPE_TEST_SECRET_KEY"], stripeApiVersion);
            if (process.env["TEST_STRIPE_LOCAL"] === "true") {
                log.warn("Using localhost:8000 for Stripe");
                stripeClientCache[mode].setHost("localhost", 8000, "http");
            }
        } else {
            if (!stripeConfigPromise) {
                throw new Error("stripeConfigPromise has not been initialized.");
            }
            const stripeConfig = await stripeConfigPromise;
            stripeClientCache[mode] = new Stripe(stripeConfig[mode].secretKey, stripeApiVersion);
        }
    }
    return stripeClientCache[mode];
}

export function getStripeClientForAuth(auth: giftbitRoutes.jwtauth.AuthorizationBadge): Promise<Stripe> {
    return getStripeClient(auth.isTestUser() ? "test" : "live");
}
