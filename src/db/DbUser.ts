import * as aws from "aws-sdk";
import * as dynameh from "dynameh";
import * as giftbitRoutes from "giftbit-cassava-routes";
import * as uuid from "uuid";
import {DbObject} from "./DbObject";
import {DbAccountUser} from "./DbAccountUser";
import {RouterResponseCookie} from "cassava/dist/RouterResponse";
import {stripUserIdTestMode} from "../utils/userUtils";
import {createdDateNow, createdDatePast, dynamodb, objectDynameh} from "./dynamodb";

/**
 * A user (person) of the system.
 */
export interface DbUser {

    /**
     * The primary key.
     */
    email: string;

    /**
     * Unique identifier.
     */
    userId: string;

    /**
     * Login details.
     */
    login: DbUser.Login;

    /**
     * Maps action type to a string token that limits the number
     * of times the action can be taken.
     *
     * This should act as `limitedActions: { [key: DbUser.limitedActions.Action]: Set<string> };`
     * but TypeScript doesn't allow union types in the key.  Add another
     * property here when adding a new Action and nothing else.
     * @see DbUser.limitedActions
     */
    limitedActions: {
        failedLogin?: Set<string>;
        accountInvitation?: Set<string>;
        accountActivationEmail?: Set<string>;
        enableSmsMfa?: Set<string>;
        changeEmailAddress?: Set<string>;
    };

    /**
     * Date the user was created.
     */
    createdDate: string;
}

export namespace DbUser {

    /**
     * If we migrate to another password hashing algorithm it should be given
     * an identifier here.
     */
    export type PasswordAlgorithm = "BCRYPT";

    export interface Login {
        /**
         * Salted, hashed password.  If this is unset the user must
         * go through password reset flow to set a password.
         */
        password?: DbUser.Password;

        /**
         * Whether the email address has been verified.  If not the user
         * must verify their email before they can log in.
         */
        emailVerified: boolean;

        /**
         * When truthy the User is frozen and cannot log in.
         * When a string it's the reason the User was frozen.
         * Currently this only gets set manually.
         */
        frozen: boolean | string;

        /**
         * Login can be time locked on too many login failures.
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
        mfa?: DbUser.Mfa;

        /**
         * The default accountId a user will log in to.
         */
        defaultLoginAccountId: string;
    }

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

    export function fromDbObject(o: DbObject): DbUser {
        if (!o) {
            return null;
        }
        const user = {...o};
        delete user.pk;
        delete user.sk;
        delete user.pk2;
        delete user.sk2;
        return user as any;
    }

    export function toDbObject(user: DbUser): DbUser & DbObject {
        if (!user) {
            return null;
        }
        return {
            ...user,
            ...getKeys(user)
        };
    }

    export function getKeys(user: DbUser): DbObject {
        if (!user || !user.email) {
            throw new Error("Not a valid User.");
        }
        return {
            pk: "User/" + user.email.toLowerCase(),
            sk: "User/" + user.email.toLowerCase(),
            pk2: "User/" + user.userId,
            sk2: "User/" + user.userId
        };
    }

    export async function get(email: string): Promise<DbUser> {
        return fromDbObject(await DbObject.get("User/" + email.toLowerCase(), "User/" + email.toLowerCase()));
    }

    export async function put(user: DbUser): Promise<void> {
        const req = buildPutInput(user);
        await dynamodb.putItem(req).promise();
    }

    export function buildPutInput(user: DbUser): aws.DynamoDB.PutItemInput {
        const req = objectDynameh.requestBuilder.buildPutInput(toDbObject(user));
        objectDynameh.requestBuilder.addCondition(req, {
            attribute: "pk",
            operator: "attribute_not_exists"
        });
        return req;
    }

    export async function update(user: DbUser, ...actions: dynameh.UpdateExpressionAction[]): Promise<void> {
        const req = buildUpdateInput(user, ...actions);
        await dynamodb.updateItem(req).promise();
    }

    export async function conditionalUpdate(user: DbUser, actions: dynameh.UpdateExpressionAction[], conditions: dynameh.Condition[]): Promise<void> {
        const req = buildUpdateInput(user, ...actions);
        if (conditions.length) {
            objectDynameh.requestBuilder.addCondition(req, ...conditions);
        }
        await dynamodb.updateItem(req).promise();
    }

    export function buildUpdateInput(user: DbUser, ...actions: dynameh.UpdateExpressionAction[]): aws.DynamoDB.UpdateItemInput {
        const req = objectDynameh.requestBuilder.buildUpdateInputFromActions(DbUser.getKeys(user), ...actions);
        objectDynameh.requestBuilder.addCondition(req, {
            attribute: "pk",
            operator: "attribute_exists"
        });
        return req;
    }

    export function buildDeleteInput(user: DbUser): aws.DynamoDB.DeleteItemInput {
        const req = objectDynameh.requestBuilder.buildDeleteInput(DbUser.getKeys(user));
        objectDynameh.requestBuilder.addCondition(req, {
            attribute: "pk",
            operator: "attribute_exists"
        });
        return req;
    }

    export async function getById(userId: string): Promise<DbUser> {
        return fromDbObject(await DbObject.getSecondary("User/" + userId, "User/" + userId));
    }

    export async function getByAuth(auth: giftbitRoutes.jwtauth.AuthorizationBadge): Promise<DbUser> {
        auth.requireIds("teamMemberId");
        const user = await getById(stripUserIdTestMode(auth.teamMemberId));
        if (!user) {
            throw new Error(`Could not find authed User ${auth.teamMemberId}`);
        }
        return user;
    }

    export function getBadge(accountUser: DbAccountUser, liveMode: boolean): giftbitRoutes.jwtauth.AuthorizationBadge {
        const auth = new giftbitRoutes.jwtauth.AuthorizationBadge();
        auth.userId = accountUser.accountId + (liveMode ? "" : "-TEST");
        auth.teamMemberId = accountUser.userId + (liveMode ? "" : "-TEST");
        auth.roles = accountUser.roles;
        auth.scopes = accountUser.scopes;
        auth.issuer = "EDHI";
        auth.audience = "WEBAPP";
        auth.expirationTime = new Date(Date.now() + 180 * 60 * 1000);
        auth.issuedAtTime = new Date();
        return auth;
    }

    /**
     * An orphaned user has no team.  All they can do is create an Account and manage themselves.
     * @param user
     */
    export function getOrphanBadge(user: DbUser): giftbitRoutes.jwtauth.AuthorizationBadge {
        const auth = new giftbitRoutes.jwtauth.AuthorizationBadge();
        auth.teamMemberId = user.userId;
        auth.roles = ["self"];
        auth.scopes = [];
        auth.issuer = "EDHI";
        auth.audience = "WEBAPP";
        auth.expirationTime = new Date(Date.now() + 180 * 60 * 1000);
        auth.issuedAtTime = new Date();
        return auth;
    }

    export function getAdditionalAuthenticationRequiredBadge(user: DbUser): giftbitRoutes.jwtauth.AuthorizationBadge {
        const auth = new giftbitRoutes.jwtauth.AuthorizationBadge();
        auth.teamMemberId = user.userId;
        auth.roles = [];
        auth.scopes = auth.effectiveScopes = ["lightrailV2:authenticate", "lightrailV2:user:read"];
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
                    maxAgeHours: 30 * 60,
                    path: "/",
                    secure: true
                }
            }
        };
    }

    export function hasMfaActive(user: DbUser): boolean {
        return !!getMfaMode(user);
    }

    export function getMfaMode(user: DbUser): null | "sms" | "totp" {
        if (user?.login?.mfa?.smsDevice) {
            return "sms";
        } else if (user?.login?.mfa?.totpSecret) {
            return "totp";
        }
        return null;
    }

    export function generateUserId(): string {
        return "user-" + uuid.v4().replace(/-/g, "");
    }

    /**
     * Functions to manipulate `limitedActions` on the DbUser.
     * Limited actions can be taken a limited number of times
     * to prevent abuse.
     */
    export namespace limitedActions {

        export type Action =
            "failedLogin"
            | "accountInvitation"
            | "accountActivationEmail"
            | "enableSmsMfa"
            | "changeEmailAddress";

        const config = {
            failedLogin: {
                maxAgeHours: 24,
                maxCount: 10
            },
            accountInvitation: {
                maxAgeHours: 24,
                maxCount: 12
            },
            accountActivationEmail: {
                maxAgeHours: 24,
                maxCount: 1
            },
            enableSmsMfa: {
                maxAgeHours: 24,
                maxCount: 8
            },
            changeEmailAddress: {
                maxAgeHours: 24,
                maxCount: 8
            }
        };

        export function isThrottled(user: DbUser, action: Action): boolean {
            if (!user.limitedActions[action]) {
                return false;
            }
            const comparator = createdDatePast(0, 0, 0, config[action].maxAgeHours);
            return Array.from(user.limitedActions[action])
                .filter(v => v > comparator)
                .length >= config[action].maxCount;
        }

        export async function add(user: DbUser, action: Action): Promise<void> {
            const value = createdDateNow();
            await DbUser.update(user, {
                action: "set_add",
                attribute: `limitedActions.${action}`,
                values: new Set([value])
            });
            if (!user.limitedActions[action]) {
                user.limitedActions[action] = new Set([value])
            } else {
                user.limitedActions[action].add(value);
            }
        }

        export function buildAddUpdateAction(action: Action): dynameh.UpdateExpressionAction {
            const value = createdDateNow();
            return {
                action: "set_add",
                attribute: `limitedActions.${action}`,
                values: new Set([value])
            };
        }

        /**
         * Build the Dynameh update action that will clear stale data.
         * @param user
         */
        export function buildClearOutdatedUpdateActions(user: DbUser): dynameh.UpdateExpressionAction[] {
            return [
                buildClearOutdatedUpdateAction(user, "failedLogin"),
                buildClearOutdatedUpdateAction(user, "accountInvitation"),
                buildClearOutdatedUpdateAction(user, "enableSmsMfa"),
            ].filter(a => !!a);
        }

        function buildClearOutdatedUpdateAction(user: DbUser, action: Action): dynameh.UpdateExpressionAction {
            if (!user.limitedActions[action]) {
                return null;
            }
            const comparator = createdDatePast(0, 0, 0, config[action].maxAgeHours);
            const valuesToRemove = Array.from(user.limitedActions[action])
                .filter(v => v < comparator);
            if (valuesToRemove.length) {
                return {
                    action: "set_delete",
                    attribute: `limitedActions.${action}`,
                    values: new Set(valuesToRemove)
                }
            }
            return null;
        }

        export function countAll(user: DbUser, action: Action): number {
            return user.limitedActions[action]?.size ?? 0;
        }

        export async function clearAll(user: DbUser, action: Action): Promise<void> {
            await DbUser.update(user, buildClearAllUpdateAction(action));
            delete user.limitedActions[action];
        }

        export function buildClearAllUpdateAction(action: Action): dynameh.UpdateExpressionAction {
            return {
                action: "remove",
                attribute: `limitedActions.${action}`
            };
        }
    }
}
