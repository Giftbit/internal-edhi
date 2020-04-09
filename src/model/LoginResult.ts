export interface LoginResult {
    userId: string;
    userEmail: string;
    mode: "test" | "live";
    hasMfa: boolean;
    message?: string;
    messageCode?: string;
}
