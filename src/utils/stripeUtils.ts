import Stripe = require("stripe");
import * as giftbitRoutes from "giftbit-cassava-routes";

const stripeApiVersion: string = "2018-05-21";

const stripeClientCache: { [key: string]: Stripe } = {};

export async function getStripeClient(mode: "test" | "live"): Promise<Stripe> {
    if (!stripeClientCache[mode]) {
        // TODO get Stripe API key, cache it
        stripeClientCache[mode] = new Stripe("key", stripeApiVersion);
    }
    return stripeClientCache[mode];
}

export function getStripeClientForAuth(auth: giftbitRoutes.jwtauth.AuthorizationBadge): Promise<Stripe> {
    return getStripeClient(auth.isTestUser() ? "test" : "live");
}
