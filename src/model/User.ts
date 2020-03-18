import {DbUser} from "../db/DbUser";

export interface User {
    id: string;
    email: string;
}

export namespace User {
    export function getFromDbUser(user: DbUser): User {
        return {
            id: user.userId,
            email: user.email
        };
    }
}
