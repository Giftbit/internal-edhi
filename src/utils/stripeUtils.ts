import Stripe from "stripe";
import * as giftbitRoutes from "giftbit-cassava-routes";
import log = require("loglevel");

const stripeApiVersion = "2020-03-02";
let stripeClient: Stripe = null;
let stripeConfigPromise: Promise<giftbitRoutes.secureConfig.StripeConfig>;

export function initializeLightrailStripeConfig(config: Promise<giftbitRoutes.secureConfig.StripeConfig>): void {
    stripeConfigPromise = config;
}

export async function getStripeClient(): Promise<Stripe> {
    if (!stripeClient) {
        if (process.env["TEST_ENV"]) {
            log.warn("Using unit test Stripe secret key from env");
            if (process.env["TEST_STRIPE_LOCAL"] === "true") {
                log.warn("Using localhost:8000 for Stripe");
                stripeClient = new Stripe(process.env["LIGHTRAIL_STRIPE_TEST_SECRET_KEY"], {
                    apiVersion: stripeApiVersion,
                    host: "localhost",
                    port: 8000,
                    protocol: "http"
                });
            } else {
                stripeClient = new Stripe(process.env["LIGHTRAIL_STRIPE_TEST_SECRET_KEY"], {
                    apiVersion: stripeApiVersion
                });
            }
        } else {
            if (!stripeConfigPromise) {
                throw new Error("stripeConfigPromise has not been initialized.");
            }
            const stripeConfig = await stripeConfigPromise;
            if (process.env["LIGHTRAIL_WEBAPP_DOMAIN"] === "www.lightraildev.net") {
                log.warn("Using test mode Stripe key in the dev domain");
                stripeClient = new Stripe(stripeConfig.test.secretKey, {
                    apiVersion: stripeApiVersion
                });
            } else {
                stripeClient = new Stripe(stripeConfig.live.secretKey, {
                    apiVersion: stripeApiVersion
                });
            }
        }
    }
    return stripeClient;
}
