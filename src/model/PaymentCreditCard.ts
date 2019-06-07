import Stripe = require("stripe");

export interface PaymentCreditCard {
    addressCity?: string;
    addressCountry?: string;
    addressLine1?: string;
    addressLine2?: string;
    addressState?: string;
    addressZip?: string;
    addressZipCheck?: string;
    brand?: string;
    country?: string;
    currency?: string;
    dynamicLast4?: string;
    expMonth?: number;
    expYear?: number;
    last4?: string;
}

export namespace PaymentCreditCard {
    export function fromStripeSource(source: Stripe.IStripeSource): PaymentCreditCard {
        if (!source) {
            return null;
        }
        if (source.object === "card") {
            return {
                addressCity: source.address_city,
                addressCountry: source.address_country,
                addressLine1: source.address_line1,
                addressLine2: source.address_line2,
                addressState: source.address_state,
                addressZip: source.address_zip,
                brand: source.brand,
                country: source.country,
                currency: source.currency,
                dynamicLast4: source.dynamic_last4,
                expMonth: source.exp_month,
                expYear: source.exp_year,
                last4: source.last4
            };
        }
        throw new Error("Stripe source is not a credit card.");
    }
}
