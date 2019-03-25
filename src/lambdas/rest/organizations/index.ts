import * as cassava from "cassava";
import {User} from "../../../model/User";
import {getUserBadge, getUserBadgeCookies, getUserByAuth} from "../../../utils/userUtils";
import * as giftbitRoutes from "giftbit-cassava-routes";

export function installOrganizationsRest(router: cassava.Router): void {
    router.route("/v2/user/organizations")
        .method("POST")
        .handler(async evt => {
            // TODO create organization
        });

    router.route("/v2/user/organizations/switch")
        .method("POST")
        .handler(async evt => {
            const auth: giftbitRoutes.jwtauth.AuthorizationBadge = evt.meta["auth"];

            evt.validateBody({
                properties: {
                    mode: {
                        type: "string",
                        enum: ["live", "test"]
                    },
                    userId: {
                        type: "string",
                        minLength: 1
                    }
                },
                required: [],
                additionalProperties: false
            });

            const user = await switchOrganization(auth, evt.body.mode, evt.body.userId);
            const userBadge = getUserBadge(user, true);

            return {
                body: null,
                statusCode: cassava.httpStatusCode.redirect.FOUND,
                headers: {
                    Location: `https://${process.env["LIGHTRAIL_WEBAPP_DOMAIN"]}/app/#`
                },
                cookies: await getUserBadgeCookies(userBadge)
            };
        });
}

async function switchOrganization(auth: giftbitRoutes.jwtauth.AuthorizationBadge, mode?: "live" | "test", userId?: string): Promise<User> {
    const user = getUserByAuth(auth);
    return null;
    // TODO determine correct organization userId, maybe save change, pass user back
}
