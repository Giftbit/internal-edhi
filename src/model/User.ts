export interface User {

    email: string;
    userId: string;
    password?: UserPassword;
    emailVerified: boolean;
    frozen: boolean;
    lockedUntilDate?: string;
    twoFactorAuthenticationDevice?: string;
    defaultLoginUserId: string;
    failedLoginAttempts?: Set<string>;
    dateCreated: string;

}

/**
 * If we migrate to another password hashing algorithm it should be given
 * an identifier here.
 */
export type UserPasswordAlgorithm = "BCRYPT";

export interface UserPassword {
    /**
     * The algorithm the password was hashed with.  Storing this allows us to change the algorithm
     * and rotate out without forcing an immediate reset of all passwords.
     */
    algorithm: UserPasswordAlgorithm;

    /**
     * Encodes the salt as well as the hashed password.
     */
    hash: string;

    /**
     * The date the password was set.
     */
    dateCreated: string;
}
