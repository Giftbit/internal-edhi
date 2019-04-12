import * as cassava from "cassava";
import * as giftbitRoutes from "giftbit-cassava-routes";

export function installPingRest(router: cassava.Router): void {
    router.route("/v2/user/ping")
        .method("GET")
        .handler(async evt => {
            const auth: giftbitRoutes.jwtauth.AuthorizationBadge = evt.meta["auth"];
            auth.requireIds("teamMemberId");

            // When JwtAuthorizationRoute does not find this header it will not think it needs to refresh
            // the cookie.  This is a bit magic but the unit tests will catch it breaking.
            if (evt.queryStringParameters.refresh === "false") {
                evt.headersLowerCase["x-requested-with"] = null;
            }

            return {
                body: {}
            };
        });
}
