import {DbUser} from "../db/DbUser";

export interface User {
    id: string;
    email: string;
    hasMfa: boolean;

    /**
     * Only set when this object refers to the logged in User.
     */
    mode?: "test" | "live";
}

export namespace User {
    export function getFromDbUser(dbUuser: DbUser, mode?: "test" | "live"): User {
        const user: User = {
            id: dbUuser.userId,
            email: dbUuser.email,
            hasMfa: DbUser.hasMfaActive(dbUuser)
        };
        if (mode) {
            user.mode = mode;
        }
        return user;
    }
}
