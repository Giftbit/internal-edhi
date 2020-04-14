import {User} from "./User";

export interface LoginResult {
    user?: User;
    mode: "test" | "live";
    message?: string;
    messageCode?: string;
}
