export interface User {

    username: string;
    password?: UserPassword;
    enabled: boolean;
    locked: boolean;
    twoFactorAuthenticationDevice?: string;
    organizations: {[userId: string]: UserOrganization};
    dateCreated: string;

}

/**
 *
 */
export type UserPasswordAlgorithm = "BCRYPT_10";

export interface UserPassword {
    /**
     * The algorithm the password was hashed with.  Storing this allows us to change the algorithm
     * and rotate out without forcing an immediate reset of all passwords.
     */
    algorithm: UserPasswordAlgorithm;
    hash: string;
    dateCreated: string;
}

export interface UserOrganization {

    userId: string;
    teamMemberId: string;
    dateCreated: string;

}
