import {DbUser} from "../db/DbUser";

export interface User {
    id: string;
    email: string;
    hasMfa: boolean;
}

export namespace User {
    export function getFromDbUser(user: DbUser): User {
        return {
            id: user.userId,
            email: user.email,
            hasMfa: DbUser.hasMfaActive(user)
        };
    }
}
