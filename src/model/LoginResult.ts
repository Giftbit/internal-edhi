export interface LoginResult {
    userId: string;
    hasMfa: boolean;
    message?: string;
    messageCode?: string;
}
