import * as cassava from "cassava";
import * as dynameh from "dynameh";
import * as giftbitRoutes from "giftbit-cassava-routes";
import {DbAccount} from "../../../db/DbAccount";
import {AccountSecurity} from "../../../model/AccountSecurity";
import log = require("loglevel");

export function installAccountSecurityRest(router: cassava.Router): void {
    router.route("/v2/account/security")
        .method("GET")
        .handler(async evt => {
            const auth: giftbitRoutes.jwtauth.AuthorizationBadge = evt.meta["auth"];
            auth.requireScopes("lightrailV2:account:read");
            auth.requireIds("userId");
            const account = await DbAccount.get(auth.userId);
            return {
                body: AccountSecurity.getFromDbAccount(account)
            };
        });

    router.route("/v2/account/security")
        .method("PATCH")
        .handler(async evt => {
            const auth: giftbitRoutes.jwtauth.AuthorizationBadge = evt.meta["auth"];
            auth.requireScopes("lightrailV2:account:update");

            evt.validateBody({
                properties: {
                    maxPasswordAge: {
                        type: ["number", "null"],
                        minimum: 7,
                        maximum: 999
                    },
                    requireMfa: {
                        type: "boolean"
                    },
                    requirePasswordHistory: {
                        type: "boolean"
                    }
                },
                required: [],
                additionalProperties: false
            });

            const account = await updateAccountSecurity(auth, evt.body);
            return {
                body: AccountSecurity.getFromDbAccount(account)
            };
        });
}

async function updateAccountSecurity(auth: giftbitRoutes.jwtauth.AuthorizationBadge, params: { maxPasswordAge?: number, requireMfa?: boolean, requirePasswordHistory?: boolean }): Promise<DbAccount> {
    auth.requireIds("userId");
    log.info("Updating AccountSecurity", auth.userId);

    const account = await DbAccount.get(auth.userId);
    if (!account) {
        throw new Error(`Could not find DbAccount for user '${auth.userId}'`);
    }

    const updates: dynameh.UpdateExpressionAction[] = [];
    if (params.maxPasswordAge !== undefined) {
        if (params.maxPasswordAge !== null && params.maxPasswordAge <= 0) {
            throw new Error("params.maxPasswordAge can't be negative");
        }
        updates.push({
            action: "put",
            attribute: "maxPasswordAge",
            value: params.maxPasswordAge
        });
        account.maxPasswordAge = params.maxPasswordAge;
    }
    if (params.requireMfa != null) {
        updates.push({
            action: "put",
            attribute: "requireMfa",
            value: params.requireMfa
        });
        account.requireMfa = params.requireMfa;
    }
    if (params.requirePasswordHistory != null) {
        updates.push({
            action: "put",
            attribute: "requirePasswordHistory",
            value: params.requirePasswordHistory
        });
        account.requirePasswordHistory = params.requirePasswordHistory;
    }

    if (updates.length) {
        await DbAccount.update(account, ...updates);
    }

    return account;
}
