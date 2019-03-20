export interface EmailVerification {
    token: string;
    userEmail: string;
    ttl: Date | number;
}
