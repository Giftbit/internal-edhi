import * as cassava from "cassava";
import * as giftbitRoutes from "giftbit-cassava-routes";
import {DbUser} from "../../../db/DbUser";
import {User} from "../../../model/User";

export function installUserRest(router: cassava.Router): void {
    router.route("/v2/user")
        .method("GET")
        .handler(async evt => {
            const auth: giftbitRoutes.jwtauth.AuthorizationBadge = evt.meta["auth"];
            auth.requireScopes("lightrailV2:user:read");
            auth.requireIds("userId");

            const user = await DbUser.getByAuth(auth);
            return {
                body: User.getFromDbUser(user)
            };
        });
}
