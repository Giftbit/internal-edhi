import * as cassava from "cassava";
import * as giftbitRoutes from "giftbit-cassava-routes";
import {getUserBadge, getUserBadgeCookies, getUserByAuth} from "../../../utils/userUtils";
import {User} from "../../../model/User";
import {TeamMember} from "../../../model/TeamMember";

export function installTeamRest(router: cassava.Router): void {
    router.route("/v2/team/switch")
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

            const user = await getUserByAuth(auth);
            const teamMember = await switchTeam(user, evt.body.mode, evt.body.userId);
            const userBadge = getUserBadge(user, teamMember, true, true);

            return {
                body: null,
                statusCode: cassava.httpStatusCode.redirect.FOUND,
                headers: {
                    Location: `https://${process.env["LIGHTRAIL_WEBAPP_DOMAIN"]}/app/#`
                },
                cookies: await getUserBadgeCookies(userBadge)
            };
        });

    router.route("/v2/team/users")
        .method("GET")
        .handler(async evt => {
            // TODO list team members
            throw new Error("Not implemented");
        });

    router.route("/v2/team/users/{id}")
        .method("GET")
        .handler(async evt => {
            // TODO read team member
            throw new Error("Not implemented");
        });

    router.route("/v2/team/users/{id}")
        .method("PATCH")
        .handler(async evt => {
            // TODO update team member
            throw new Error("Not implemented");
        });

    router.route("/v2/team/users/{id}")
        .method("DELETE")
        .handler(async evt => {
            // TODO delete team member
            throw new Error("Not implemented");
        });

    router.route("/v2/team/invites")
        .method("POST")
        .handler(async evt => {
            // TODO create invite
            throw new Error("Not implemented");
        });

    router.route("/v2/team/invites")
        .method("GET")
        .handler(async evt => {
            // TODO list invites
            throw new Error("Not implemented");
        });

    router.route("/v2/team/invites/{id}")
        .method("GET")
        .handler(async evt => {
            // TODO read invite
            throw new Error("Not implemented");
        });

    router.route("/v2/team/invites/{id}")
        .method("DELETE")
        .handler(async evt => {
            // TODO delete invite
            throw new Error("Not implemented");
        });
}

async function switchTeam(user: User, mode?: "live" | "test", userId?: string): Promise<TeamMember> {
    return null;
    // TODO determine correct organization userId, maybe save change, pass user back
}
