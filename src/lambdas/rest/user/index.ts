import * as cassava from "cassava";
import * as giftbitRoutes from "giftbit-cassava-routes";
import {User} from "../../../model/User";
import {hashIntercomUserId} from "../../../utils/intercomUtils";
import {DbUser} from "../../../db/DbUser";
import {DbAccountUser} from "../../../db/DbAccountUser";
import {stripUserIdTestMode} from "../../../utils/userUtils";
import {SwitchableAccount} from "../../../model/SwitchableAccount";

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

    router.route("/v2/user/accounts")
        .method("GET")
        .handler(async evt => {
            const auth: giftbitRoutes.jwtauth.AuthorizationBadge = evt.meta["auth"];
            auth.requireScopes("lightrailV2:user:read");
            auth.requireIds("teamMemberId");
            const accountUsers = await DbAccountUser.getAllForUser(auth.teamMemberId);
            const currentAccount = stripUserIdTestMode(auth.userId);
            return {
                body: accountUsers.map(accountUser => SwitchableAccount.fromDbAccountUser(accountUser, accountUser.accountId === currentAccount))
            };
        });

    router.route("/v2/user/intercom")
        .method("GET")
        .serializers({
            "application/json": cassava.serializers.jsonSerializer
        })
        .handler(async evt => {
            const auth: giftbitRoutes.jwtauth.AuthorizationBadge = evt.meta["auth"];
            auth.requireIds("userId", "teamMemberId");

            const teamMemberId = auth.teamMemberId.replace("-TEST", "");

            return {
                body: {
                    userHash: await hashIntercomUserId(teamMemberId),
                    teamMemberId
                }
            };
        });
}
