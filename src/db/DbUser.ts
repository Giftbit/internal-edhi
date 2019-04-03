import * as cassava from "cassava";
import * as giftbitRoutes from "giftbit-cassava-routes";
import * as uuid from "uuid/v4";
import {dynamodb, userByUserIdDynameh, userDynameh} from "./dynamodb";
import {stripUserIdTestMode} from "../utils/userUtils";
import {DbTeamMember} from "./DbTeamMember";
import {RouterResponseCookie} from "cassava/dist/RouterResponse";
import log = require("loglevel");

export interface DbUser {

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

export namespace DbUser {
    let authConfig: Promise<giftbitRoutes.secureConfig.AuthenticationConfig>;

    export function initializeBadgeSigningSecrets(authConfigPromise: Promise<giftbitRoutes.secureConfig.AuthenticationConfig>): void {
        authConfig = authConfigPromise;
    }

    export function generateUserId(): string {
        return "user-" + uuid().replace(/-/g, "");
    }

    export async function getByEmail(email: string): Promise<DbUser> {
        log.debug("getUserByEmail", email);
        const getUserReq = userDynameh.requestBuilder.buildGetInput(email);
        const getUserResp = await dynamodb.getItem(getUserReq).promise();
        return userDynameh.responseUnwrapper.unwrapGetOutput(getUserResp);
    }

    export async function getByAuth(auth: giftbitRoutes.jwtauth.AuthorizationBadge): Promise<DbUser> {
        auth.requireIds("teamMemberId");

        const userId = stripUserIdTestMode(auth.teamMemberId);
        const user = await DbUser.getById(userId);
        if (!user) {
            log.error("Could not find user with userId", userId, "despite having a valid JWT");
            throw new giftbitRoutes.GiftbitRestError(cassava.httpStatusCode.clientError.FORBIDDEN);
        }

        return user;
    }

    export async function getById(userId: string): Promise<DbUser> {
        const queryUserReq = userByUserIdDynameh.requestBuilder.buildQueryInput(stripUserIdTestMode(userId));
        const queryUserResp = await dynamodb.query(queryUserReq).promise();
        const users = await userByUserIdDynameh.responseUnwrapper.unwrapQueryOutput(queryUserResp);
        return users[0];
    }

    export function getBage(user: DbUser, teamMember: DbTeamMember | null, liveMode: boolean, shortLived: boolean): giftbitRoutes.jwtauth.AuthorizationBadge {
        if (!teamMember) {
            // This is an orphaned user with no team.  All they can do is create
            // a new team.
            const auth = new giftbitRoutes.jwtauth.AuthorizationBadge();
            auth.teamMemberId = user.userId;
            auth.roles = [];
            auth.issuer = "EDHI";
            auth.audience = "WEBAPP";
            auth.expirationTime = new Date(Date.now() + 180 * 60000);
            auth.issuedAtTime = new Date();
            return auth;
        }

        const auth = new giftbitRoutes.jwtauth.AuthorizationBadge();
        auth.userId = teamMember.userId + (liveMode ? "" : "-TEST");
        auth.teamMemberId = teamMember.teamMemberId + (liveMode ? "" : "-TEST");
        auth.roles = teamMember.roles;
        auth.scopes = teamMember.scopes || [];
        auth.issuer = "EDHI";
        auth.audience = shortLived ? "WEBAPP" : "API";
        auth.expirationTime = shortLived ? new Date(Date.now() + 180 * 60000) : null;
        auth.issuedAtTime = new Date();
        return auth;
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
