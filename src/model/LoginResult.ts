import {User} from "./User";

export interface LoginResult {
    user?: User;
    message?: string;
    messageCode?: string;
}
