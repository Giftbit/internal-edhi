/**
 * Send a user an email with a token that lets them take an
 * anonymous action based on the token.
 */
export interface TokenAction {
    token: string;
    action: "emailVerification" | "resetPassword";
    userEmail: string;
    ttl: Date | number;
}
