import * as dynameh from "dynameh";
import * as giftbitRoutes from "giftbit-cassava-routes";
import {DbObject} from "./DbObject";
import {DbAccountUser} from "./DbAccountUser";
import {RouterResponseCookie} from "cassava/dist/RouterResponse";
import {stripUserIdTestMode} from "../utils/userUtils";
import {dynamodb, objectDynameh} from "./dynamodb";

/**
 * Stores login information about a user.  Users log in with their email address
 * so that is the primary key.
 */
export interface DbUserLogin {

    /**
     * The primary key.
     */
    email: string;

    /**
     * This userId/email combo *must* match the UserDetails.
     */
    userId: string;

    /**
     * Salted, hashed password.  If this is unset the user must
     * go through password reset flow to set a password.
     */
    password?: DbUserLogin.Password;

    /**
     * Whether the email address has been verified.  If not the user
     * must verify their email before they can log in.
     */
    emailVerified: boolean;

    /**
     * Frozen users cannot log in.  We don't yet have any controls for
     * setting this but it may be useful in the future.
     */
    frozen: boolean;

    /**
     * Accounts can be time locked on too many login failures.
     */
    lockedUntilDate?: string;

    /**
     * Date of the last successful login.
     */
    lastLoginDate?: string;

    /**
     * MFA settings.  Includes state on enabling MFA so the existence
     * of this object is not enough to know that MFA is enabled.
     */
    mfa?: DbUserLogin.Mfa;

    /**
     * The default account userId a user will log in to
     * if none is specified.
     */
    defaultLoginAccountId: string;

    /**
     * A history of recent failed log in attempt Dates.  Too many
     * failed logins will time lock the account.  A successful login
     * clears the Set.
     */
    failedLoginAttempts?: Set<string>;

    /**
     * Date the account was created.
     */
    createdDate: string;
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
        createdDate: string;
    }

    /**
     * For MFA to be enabled this object must be set and one of the devices defined.
     */
    export interface Mfa {
        /**
         * SMS device (phone number) to use as a factor in authentication.
         * When this is set SMS MFA is enabled.
         */
        smsDevice?: string;

        /**
         * State for enabling or authenticating with SMS MFA.
         */
        smsAuthState?: SmsAuthState;

        /**
         * Encrypted secret used to generate TOTP codes.
         * When this is set TOTP MFA is enabled.
         */
        totpSecret?: string;

        /**
         * A map of a code to details about when it was used.
         * This is used to prevent replaying of codes for login.
         */
        totpUsedCodes?: { [code: string]: TotpUsedCode };

        /**
         * State for enabling TOTP.  This can be set while `totpSecret`
         * is set to change TOTP devices without accidentally disabling MFA.
         */
        totpSetup?: TotpSetup;

        /**
         * Codes that can only be used once.
         */
        backupCodes?: { [code: string]: BackupCode };

        /**
         * Codes that can be saved on a device to indicate that the device is
         * trusted.  These codes expire.
         */
        trustedDevices: { [key: string]: TrustedDevice };
    }

    export interface SmsAuthState {
        device: string;
        code: string;
        action: "enable" | "auth";
        createdDate: string;
        expiresDate: string;
    }

    export interface TotpSetup {
        secret: string;
        lastCodes: string[];
        createdDate: string;
        expiresDate: string;
    }

    export interface TotpUsedCode {
        createdDate: string;
    }

    export interface BackupCode {
        createdDate: string;
    }

    export interface TrustedDevice {
        createdDate: string;
        expiresDate: string;
    }

    export function fromDbObject(o: DbObject): DbUserLogin {
        if (!o) {
            return null;
        }
        const userLogin = {...o};
        delete userLogin.pk;
        delete userLogin.sk;
        delete userLogin.pk2;
        delete userLogin.sk2;
        return userLogin as any;
    }

    export function toDbObject(userLogin: DbUserLogin): DbUserLogin & DbObject {
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
            sk: "UserLogin/" + userLogin.email,
            pk2: "UserLogin/" + userLogin.userId,
            sk2: "UserLogin/" + userLogin.userId,
        };
    }

    export async function get(email: string): Promise<DbUserLogin> {
        return fromDbObject(await DbObject.get("UserLogin/" + email, "UserLogin/" + email));
    }

    export async function put(userLogin: DbUserLogin): Promise<void> {
        await DbObject.put(toDbObject(userLogin));
    }

    export async function update(userLogin: DbUserLogin, ...actions: dynameh.UpdateExpressionAction[]): Promise<void> {
        const req = objectDynameh.requestBuilder.buildUpdateInputFromActions(DbUserLogin.getKeys(userLogin), ...actions);
        objectDynameh.requestBuilder.addCondition(req, {
            attribute: "pk",
            operator: "attribute_exists"
        });
        await dynamodb.updateItem(req).promise();
    }

    export async function conditionalUpdate(userLogin: DbUserLogin, actions: dynameh.UpdateExpressionAction[], conditions: dynameh.Condition[]): Promise<void> {
        const req = objectDynameh.requestBuilder.buildUpdateInputFromActions(DbUserLogin.getKeys(userLogin), ...actions);
        objectDynameh.requestBuilder.addCondition(req, {
            attribute: "pk",
            operator: "attribute_exists"
        }, ...conditions);
        await dynamodb.updateItem(req).promise();
    }

    export async function getById(userId: string): Promise<DbUserLogin> {
        return fromDbObject(await DbObject.getSecondary("UserLogin/" + userId, "UserLogin/" + userId));
    }

    export async function getByAuth(auth: giftbitRoutes.jwtauth.AuthorizationBadge): Promise<DbUserLogin> {
        auth.requireIds("teamMemberId");
        const userLogin = await getById(stripUserIdTestMode(auth.teamMemberId));
        if (!userLogin) {
            throw new Error(`Could not find authed UserLogin ${auth.teamMemberId}`);
        }
        return userLogin;
    }

    export function getBadge(accountUser: DbAccountUser, liveMode: boolean, shortLived: boolean): giftbitRoutes.jwtauth.AuthorizationBadge {
        const auth = new giftbitRoutes.jwtauth.AuthorizationBadge();
        auth.userId = accountUser.accountId + (liveMode ? "" : "-TEST");
        auth.teamMemberId = accountUser.userId + (liveMode ? "" : "-TEST");
        auth.roles = accountUser.roles;
        auth.scopes = accountUser.scopes;
        auth.issuer = "EDHI";
        auth.audience = shortLived ? "WEBAPP" : "API";
        auth.expirationTime = shortLived ? new Date(Date.now() + 180 * 60 * 1000) : null;
        auth.issuedAtTime = new Date();
        return auth;
    }

    /**
     * An orphaned user has no team.  All they can do is create an Account and manage themselves.
     * @param userLogin
     */
    export function getOrphanBadge(userLogin: DbUserLogin): giftbitRoutes.jwtauth.AuthorizationBadge {
        const auth = new giftbitRoutes.jwtauth.AuthorizationBadge();
        auth.teamMemberId = userLogin.userId;
        auth.roles = [
            "lightrailV2:account:create",
            "lightrailV2:user:read",
            "lightrailV2:user:write"
        ];
        auth.scopes = [];
        auth.issuer = "EDHI";
        auth.audience = "WEBAPP";
        auth.expirationTime = new Date(Date.now() + 180 * 60 * 1000);
        auth.issuedAtTime = new Date();
        return auth;
    }

    export function getAdditionalAuthenticationRequiredBadge(userLogin: DbUserLogin): giftbitRoutes.jwtauth.AuthorizationBadge {
        const auth = new giftbitRoutes.jwtauth.AuthorizationBadge();
        auth.teamMemberId = userLogin.userId;
        auth.roles = [];
        auth.scopes = ["lightrailV2:authenticate"];
        auth.issuer = "EDHI";
        auth.audience = "WEBAPP";
        auth.expirationTime = new Date(Date.now() + 15 * 60 * 1000);
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

    export function hasMfaActive(userLogin: DbUserLogin): boolean {
        return !!(userLogin?.mfa?.smsDevice) || !!(userLogin?.mfa?.totpSecret);
    }
}
