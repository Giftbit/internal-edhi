import * as giftbitRoutes from "giftbit-cassava-routes";

export interface User {

    email: string;
    password?: UserPassword;
    emailVerified: boolean;
    frozen: boolean;
    twoFactorAuthenticationDevice?: string;
    defaultLoginOrganizationId: string;
    organizations: {[userId: string]: UserOrganization};
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

export interface UserOrganization {

    userId: string;
    teamMemberId: string;
    jwtPayload: giftbitRoutes.jwtauth.JwtPayload;
    dateCreated: string;

}
