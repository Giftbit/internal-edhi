import * as cassava from "cassava";
import * as giftbitRoutes from "giftbit-cassava-routes";
import {getStripeClient} from "../../../utils/stripeUtils";
import {stripUserIdTestMode} from "../../../utils/userUtils";
import {PaymentCreditCard} from "../../../model/PaymentCreditCard";
import {DbAccount} from "../../../db/DbAccount";
import {DbUser} from "../../../db/DbUser";
import Stripe from "stripe";
import log = require("loglevel");

export function installPaymentsRest(router: cassava.Router): void {
    router.route("/v2/account/payments/card")
        .method("GET")
        .handler(async evt => {
            const auth: giftbitRoutes.jwtauth.AuthorizationBadge = evt.meta["auth"];
            auth.requireScopes("lightrailV2:account:payments:card:read");
            auth.requireIds("userId");

            const card = await getActiveCreditCard(auth);
            if (!card) {
                throw new giftbitRoutes.GiftbitRestError(cassava.httpStatusCode.clientError.NOT_FOUND);
            }

            return {
                body: card
            };
        });

    router.route("/v2/account/payments/card")
        .method("POST")
        .handler(async evt => {
            const auth: giftbitRoutes.jwtauth.AuthorizationBadge = evt.meta["auth"];
            auth.requireScopes("lightrailV2:account:payments:card:update");
            auth.requireIds("userId");

            evt.validateBody({
                type: "object",
                properties: {
                    cardToken: {
                        type: "string",
                        minLength: 1
                    }
                },
                required: ["cardToken"]
            });

            return {
                body: await setActiveCreditCard(auth, evt.body.cardToken)
            };
        });

    router.route("/v2/account/payments/card")
        .method("DELETE")
        .handler(async evt => {
            const auth: giftbitRoutes.jwtauth.AuthorizationBadge = evt.meta["auth"];
            auth.requireScopes("lightrailV2:account:payments:card:delete");
            auth.requireIds("userId");

            await clearActiveCreditCard(auth);
            return {
                body: {}
            };
        });

    router.route("/v2/account/payments/subscriptionTier")
        .method("GET")
        .handler(async evt => {
            // This can be deleted after the web app removes subscription tiers from the UI.
            throw new giftbitRoutes.GiftbitRestError(cassava.httpStatusCode.clientError.GONE, "Subscription tiers are not supported at this time.");
        });
}

async function getActiveCreditCard(auth: giftbitRoutes.jwtauth.AuthorizationBadge): Promise<PaymentCreditCard> {
    const customer = await getStripeCustomerOrNull(auth);
    return PaymentCreditCard.fromCustomer(customer);
}

async function setActiveCreditCard(auth: giftbitRoutes.jwtauth.AuthorizationBadge, cardToken: string): Promise<PaymentCreditCard> {
    const customer = await getOrCreateStripeCustomer(auth);

    try {
        const stripe = await getStripeClient();
        const updatedCustomer = await stripe.customers.update(customer.id, {
            source: cardToken,
            ...await getDefaultStripeCustomerProperties(auth)
        });
        return PaymentCreditCard.fromCustomer(updatedCustomer);
    } catch (err) {
        if ((err as Stripe.StripeError).type === "StripeConnectionError") {
            log.warn(err);
            throw new giftbitRoutes.GiftbitRestError(cassava.httpStatusCode.serverError.BAD_GATEWAY, "There was a problem connecting to Stripe.  Your credit card details may not have been saved.");
        } else if ((err as Stripe.StripeError).code === "resource_missing" && (err as Stripe.StripeError).param === "source") {
            log.warn(err);
            throw new giftbitRoutes.GiftbitRestError(cassava.httpStatusCode.clientError.UNPROCESSABLE_ENTITY, "The Stripe token is not a credit card token.");
        } else if ((err as Stripe.StripeError).type === "StripeCardError") {
            log.warn(err);
            throw new giftbitRoutes.GiftbitRestError(cassava.httpStatusCode.clientError.CONFLICT, "Your card was declined.  Please check that the details you entered are correct.  If the details look right, call your bank.");
        }
        throw err;
    }
}

async function clearActiveCreditCard(auth: giftbitRoutes.jwtauth.AuthorizationBadge): Promise<void> {
    const stripe = await getStripeClient();
    const customer = await getOrCreateStripeCustomer(auth);
    if (customer.default_source && typeof customer.default_source === "string") {
        await stripe.customers.deleteSource(customer.id, customer.default_source);
    }
}

async function getStripeCustomerOrNull(auth: giftbitRoutes.jwtauth.AuthorizationBadge): Promise<Stripe.Customer> {
    const stripe = await getStripeClient();
    const customerId = stripUserIdTestMode(auth.userId);
    try {
        const customer = await stripe.customers.retrieve(customerId);
        if (customer.deleted) {
            throw new Error(`Customer '${customer.id}' is deleted.  That's not expected to ever happen.`);
        }
        return customer as Stripe.Customer;
    } catch (err) {
        if (err.code === "resource_missing") {
            return null;
        }
        throw err;
    }
}

async function getOrCreateStripeCustomer(auth: giftbitRoutes.jwtauth.AuthorizationBadge): Promise<Stripe.Customer> {
    const stripe = await getStripeClient();
    const customerId = stripUserIdTestMode(auth.userId);

    try {
        const customer = await stripe.customers.retrieve(customerId);
        if (customer.deleted) {
            // We don't do this in this service.  Hopefully no one else ever does.
            throw new Error(`Stripe customer '${customer.id}' has been deleted and cannot be recreated.`);
        }
        return customer as Stripe.Customer;
    } catch (err) {
        if (err.code === "resource_missing") {
            const customer = await stripe.customers.create({
                id: customerId, // `id` is not listed in ICustomerCreationOptions but this does work
                ...await getDefaultStripeCustomerProperties(auth)
            } as any);
            if (customer.id !== customerId) {
                // Check that it continues to work as expected.
                throw new Error(`Stripe customer created with ID '${customer.id}' does not match the account ID '${customerId}'.`);
            }
            return customer;
        }
        throw err;
    }
}

async function getDefaultStripeCustomerProperties(auth: giftbitRoutes.jwtauth.AuthorizationBadge): Promise<{ email: string, name: string }> {
    const user = await DbUser.getByAuth(auth);
    const account = await DbAccount.getByAuth(auth);
    return {
        email: user.email,
        name: account.name
    };
}
