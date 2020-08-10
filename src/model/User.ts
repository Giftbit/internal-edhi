import * as giftbitRoutes from "giftbit-cassava-routes";
import {DbUser} from "../db/DbUser";

export interface User {
    id: string;
    email: string;
    hasMfa: boolean;    // TODO remove after webapp migrates to `mfa`
    mfa: null | "sms" | "totp";

    // Below are only set when this object refers to the logged in User.
    mode?: "test" | "live";
    additionalAuthenticationRequired?: boolean;
}

export namespace User {
    export function getFromDbUser(dbUuser: DbUser, auth?: giftbitRoutes.jwtauth.AuthorizationBadge): User {
        const user: User = {
            id: dbUuser.userId,
            email: dbUuser.email,
            hasMfa: DbUser.hasMfaActive(dbUuser),
            mfa: DbUser.getMfaMode(dbUuser)
        };
        if (auth) {
            user.mode = auth.isTestUser() ? "test" : "live";
            user.additionalAuthenticationRequired = auth.hasScope("lightrailV2:authenticate");
        }
        return user;
    }
}
