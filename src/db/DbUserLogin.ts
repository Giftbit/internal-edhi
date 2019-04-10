import * as dynameh from "dynameh";
import * as giftbitRoutes from "giftbit-cassava-routes";
import {DbObject} from "./DbObject";
import {DbTeamMember} from "./DbTeamMember";
import {RouterResponseCookie} from "cassava/dist/RouterResponse";
import {DbUserDetails} from "./DbUserDetails";
import {stripUserIdTestMode} from "../utils/userUtils";
import {dynamodb, objectDynameh} from "./dynamodb";

export interface DbUserLogin {

    /**
     * The primary index.
     */
    email: string;

    /**
     * This userId/email combo *must* match the UserDetails.  It may show up
     * in other places that are non-authoritative.
     */
    userId: string;

    password?: DbUserLogin.Password;
    emailVerified: boolean;
    frozen: boolean;
    lockedUntilDate?: string;
    mfa?: DbUserLogin.MFA;
    defaultLoginUserId: string;
    failedLoginAttempts?: Set<string>;
    dateCreated: string;
}

export namespace DbUserLogin {
    /**
     * If we migrate to another password hashing algorithm it should be given
     * an identifier here.
     */
    export type PasswordAlgorithm = "BCRYPT";

    export interface Password {
        /**
         * The algorithm the password was hashed with.  Storing this allows us to change the algorithm
         * and rotate out without forcing an immediate reset of all passwords.
         */
        algorithm: PasswordAlgorithm;

        /**
         * Encodes the salt as well as the hashed password.
         */
        hash: string;

        /**
         * The date the password was set.
         */
        dateCreated: string;
    }

    export interface MFA {
        /**
         * Was `twoFactorAuthenticationDevice` in v1.
         */
        smsDevice?: string;
    }

    export function fromDbObject(o: DbObject): DbUserLogin {
        if (!o) {
            return null;
        }
        const userLogin = {...o};
        delete userLogin.pk;
        delete userLogin.sk;
        return userLogin as any;
    }

    export function toDbObject(userLogin: DbUserLogin) {
        if (!userLogin) {
            return null;
        }
        return {
            ...userLogin,
            ...getKeys(userLogin)
        };
    }

    export function getKeys(userLogin: DbUserLogin): DbObject {
        if (!userLogin || !userLogin.email) {
            throw new Error("Not a valid UserLogin.");
        }
        return {
            pk: "UserLogin/" + userLogin.email,
            sk: "UserLogin/" + userLogin.email
        }
    }

    export async function get(email: string): Promise<DbUserLogin> {
        return fromDbObject(await DbObject.get("UserLogin/" + email, "UserLogin/" + email));
    }

    export async function update(userLogin: DbUserLogin, ...actions: dynameh.UpdateExpressionAction[]): Promise<void> {
        const req = objectDynameh.requestBuilder.buildUpdateInputFromActions(DbUserLogin.getKeys(userLogin), ...actions);
        objectDynameh.requestBuilder.addCondition(req, {
            attribute: "pk",
            operator: "attribute_exists"
        });
        await dynamodb.updateItem(req).promise();
    }

    export async function getById(userId: string): Promise<DbUserLogin> {
        const userDetails = await DbUserDetails.get(userId);
        return userDetails && get(userDetails.email);
    }

    export async function getByAuth(auth: giftbitRoutes.jwtauth.AuthorizationBadge): Promise<DbUserLogin> {
        auth.requireIds("teamMemberId");
        return getById(stripUserIdTestMode(auth.teamMemberId));
    }

    export function getBadge(teamMember: DbTeamMember, liveMode: boolean, shortLived: boolean): giftbitRoutes.jwtauth.AuthorizationBadge {
        const auth = new giftbitRoutes.jwtauth.AuthorizationBadge();
        auth.userId = teamMember.userId + (liveMode ? "" : "-TEST");
        auth.teamMemberId = teamMember.teamMemberId + (liveMode ? "" : "-TEST");
        auth.roles = teamMember.roles;
        auth.scopes = teamMember.scopes;
        auth.issuer = "EDHI";
        auth.audience = shortLived ? "WEBAPP" : "API";
        auth.expirationTime = shortLived ? new Date(Date.now() + 180 * 60000) : null;
        auth.issuedAtTime = new Date();
        return auth;
    }

    /**
     * An orphaned user has no team.  All they can do is create an Account.
     * @param userLogin
     */
    export function getOrphanBadge(userLogin: DbUserLogin): giftbitRoutes.jwtauth.AuthorizationBadge {
        const auth = new giftbitRoutes.jwtauth.AuthorizationBadge();
        auth.teamMemberId = userLogin.userId;
        auth.roles = [];
        auth.scopes = [];
        auth.issuer = "EDHI";
        auth.audience = "WEBAPP";
        auth.expirationTime = new Date(Date.now() + 180 * 60000);
        auth.issuedAtTime = new Date();
        return auth;
    }

    let authConfig: Promise<giftbitRoutes.secureConfig.AuthenticationConfig>;

    export function initializeBadgeSigningSecrets(authConfigPromise: Promise<giftbitRoutes.secureConfig.AuthenticationConfig>): void {
        authConfig = authConfigPromise;
    }

    export async function getBadgeApiToken(badge: giftbitRoutes.jwtauth.AuthorizationBadge): Promise<string> {
        if (!authConfig) {
            throw new Error("authConfig is not initialized");
        }

        return badge.sign((await authConfig).secretkey);
    }

    export async function getBadgeCookies(badge: giftbitRoutes.jwtauth.AuthorizationBadge): Promise<{ [key: string]: RouterResponseCookie }> {
        if (!authConfig) {
            throw new Error("authConfig is not initialized");
        }

        const signed = badge.sign((await authConfig).secretkey);
        const signedBits = signed.split(".");
        if (signedBits.length !== 3) {
            throw new Error("Expected signedBits.length === 3");
        }

        return {
            "gb_jwt_session": {
                value: signedBits[0] + "." + signedBits[1],
                options: {
                    httpOnly: false,
                    path: "/",
                    secure: true
                }
            },
            "gb_jwt_signature": {
                value: signedBits[2],
                options: {
                    httpOnly: true,
                    maxAge: 30 * 60,
                    path: "/",
                    secure: true
                }
            }
        };
    }
}
