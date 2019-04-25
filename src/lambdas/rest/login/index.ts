import * as cassava from "cassava";
import * as giftbitRoutes from "giftbit-cassava-routes";
import * as uuid from "uuid/v4";
import {createdDateNow} from "../../../db/dynamodb";
import {validatePassword} from "../../../utils/passwordUtils";
import {sendEmailAddressVerificationEmail} from "../registration/sendEmailAddressVerificationEmail";
import {DbTeamMember} from "../../../db/DbTeamMember";
import {DbUserLogin} from "../../../db/DbUserLogin";
import {isTestModeUserId} from "../../../utils/userUtils";
import {sendSmsMfaChallenge} from "../mfa";
import {sendFailedLoginTimeoutEmail} from "./sendFailedLoginTimeoutEmail";
import * as dynameh from "dynameh";
import {RouterResponseCookie} from "cassava/dist/RouterResponse";
import {validateOtpCode} from "../../../utils/otpUtils";
import log = require("loglevel");

const maxFailedLoginAttempts = 10;
const failedLoginTimoutMinutes = 60;
const trustedDeviceExpirationDays = 14;
const totpUsedCodeTimeoutMillis = 3 * 60 * 1000;

export function installLoginUnauthedRest(router: cassava.Router): void {
    router.route("/v2/user/login")
        .method("POST")
        .handler(async evt => {
            evt.validateBody({
                properties: {
                    email: {
                        type: "string"
                    },
                    password: {
                        type: "string"
                    }
                },
                required: ["email", "password"],
                additionalProperties: false
            });

            const cookies = await loginUser({
                email: evt.body.email,
                plaintextPassword: evt.body.password,
                sourceIp: evt.requestContext.identity.sourceIp,
                trustedDeviceToken: evt.cookies["gb_ttd"]
            });

            return {
                body: null,
                statusCode: cassava.httpStatusCode.redirect.FOUND,
                headers: {
                    Location: `https://${process.env["LIGHTRAIL_WEBAPP_DOMAIN"]}/app/#`
                },
                cookies: cookies
            };
        });

    router.route("/v2/user/logout")
        .handler(async () => {
            return {
                body: null,
                statusCode: cassava.httpStatusCode.redirect.FOUND,
                headers: {
                    Location: `https://${process.env["LIGHTRAIL_WEBAPP_DOMAIN"]}/app/#`
                },
                cookies: {
                    "gb_jwt_session": {
                        value: "",
                        options: {
                            httpOnly: false,
                            expires: new Date(0),   // Clears the cookie per RFC 6255.
                            path: "/",
                            secure: true,
                        }
                    },
                    "gb_jwt_signature": {
                        value: "",
                        options: {
                            httpOnly: true,
                            expires: new Date(0),
                            path: "/",
                            secure: true,
                        }
                    }
                }
            };
        });
}

export function installLoginAuthedRest(router: cassava.Router): void {
    router.route("/v2/user/login/mfa")
        .method("GET")
        .handler(async evt => {
            const auth: giftbitRoutes.jwtauth.AuthorizationBadge = evt.meta["auth"];
            auth.requireScopes("lightrailV2:authenticate");

            const userLogin = await DbUserLogin.getByAuth(auth);
            if (userLogin.mfa && userLogin.mfa.smsDevice) {
                await sendSmsMfaChallenge(userLogin);
            }
            return {
                body: {}
            };
        });

    router.route("/v2/user/login/mfa")
        .method("POST")
        .handler(async evt => {
            const auth: giftbitRoutes.jwtauth.AuthorizationBadge = evt.meta["auth"];
            auth.requireScopes("lightrailV2:authenticate");

            evt.validateBody({
                properties: {
                    code: {
                        type: "string",
                        minLength: 1
                    },
                    trustThisDevice: {
                        type: "boolean"
                    }
                },
                required: ["code"],
                additionalProperties: false
            });

            const cookies = await completeMfaLogin(auth, {
                code: evt.body.code,
                trustThisDevice: evt.body.trustThisDevice,
                sourceIp: evt.requestContext.identity.sourceIp
            });
            return {
                body: null,
                statusCode: cassava.httpStatusCode.redirect.FOUND,
                headers: {
                    Location: `https://${process.env["LIGHTRAIL_WEBAPP_DOMAIN"]}/app/#`
                },
                cookies: cookies
            };
        });
}

async function loginUser(params: { email: string, plaintextPassword: string, sourceIp: string, trustedDeviceToken?: string }): Promise<{ [key: string]: RouterResponseCookie }> {
    const userLogin = await DbUserLogin.get(params.email);

    if (!userLogin) {
        log.warn("Could not log in user", params.email, "user not found");
        throw new giftbitRoutes.GiftbitRestError(cassava.httpStatusCode.clientError.UNAUTHORIZED);
    }
    if (!userLogin.emailVerified) {
        log.warn("Could not log in user", params.email, "email is not verified");
        await sendEmailAddressVerificationEmail(userLogin.email);
        throw new giftbitRoutes.GiftbitRestError(cassava.httpStatusCode.clientError.UNAUTHORIZED, "You must verify your email address before you can log in.  A new registration email has been sent to your email address.");
    }
    if (userLogin.frozen) {
        log.warn("Could not log in user", params.email, "user is frozen");
        throw new giftbitRoutes.GiftbitRestError(cassava.httpStatusCode.clientError.UNAUTHORIZED);
    }
    if (userLogin.lockedUntilDate && userLogin.lockedUntilDate >= createdDateNow()) {
        log.warn("Could not log in user", params.email, "user is locked until", userLogin.lockedUntilDate);
        throw new giftbitRoutes.GiftbitRestError(cassava.httpStatusCode.clientError.UNAUTHORIZED);
    }
    if (!await validatePassword(params.plaintextPassword, userLogin.password)) {
        log.warn("Could not log in user", params.email, "password did not validate");
        await userLoginFailure(userLogin, params.sourceIp);
        throw new giftbitRoutes.GiftbitRestError(cassava.httpStatusCode.clientError.UNAUTHORIZED);
    }

    if (userLogin.mfa) {
        if (params.trustedDeviceToken) {
            if (userLogin.mfa.trustedDevices[params.trustedDeviceToken] && userLogin.mfa.trustedDevices[params.trustedDeviceToken].expiresDate > createdDateNow()) {
                log.info("User", params.email, "has a trusted device");
                const userBadge = await userLoginSuccess(userLogin);
                return await DbUserLogin.getBadgeCookies(userBadge);
            }
            log.info("User", params.email, "trusted device token is not trusted");
            log.debug("params.trustedDeviceToken=", params.trustedDeviceToken, "trustedDevices=", userLogin.mfa.trustedDevices);
        }
        if (userLogin.mfa.smsDevice) {
            log.info("Partially logged in user", params.email, "sending SMS code");

            await sendSmsMfaChallenge(userLogin);
            const badge = DbUserLogin.getAdditionalAuthenticationRequiredBadge(userLogin);
            return await DbUserLogin.getBadgeCookies(badge);
        }
        if (userLogin.mfa.totpSecret) {
            log.info("Partially logged in user", params.email, "awaiting TOTP code");
            const badge = DbUserLogin.getAdditionalAuthenticationRequiredBadge(userLogin);
            return await DbUserLogin.getBadgeCookies(badge);
        }
    }

    const userBadge = await userLoginSuccess(userLogin);
    return await DbUserLogin.getBadgeCookies(userBadge);
}

async function completeMfaLogin(auth: giftbitRoutes.jwtauth.AuthorizationBadge, params: { code: string, trustThisDevice?: boolean, sourceIp: string }): Promise<{ [key: string]: RouterResponseCookie }> {
    const userLogin = await DbUserLogin.getByAuth(auth);

    if (userLogin.frozen) {
        log.warn("Could not log in user", auth.teamMemberId, "user is frozen");
        throw new giftbitRoutes.GiftbitRestError(cassava.httpStatusCode.clientError.UNAUTHORIZED);
    }
    if (userLogin.lockedUntilDate && userLogin.lockedUntilDate >= createdDateNow()) {
        log.warn("Could not log in user", auth.teamMemberId, "user is locked until", userLogin.lockedUntilDate);
        throw new giftbitRoutes.GiftbitRestError(cassava.httpStatusCode.clientError.UNAUTHORIZED);
    }
    if (!userLogin.mfa) {
        log.warn("Could not log in user", auth.teamMemberId, "MFA is not enabled");
        throw new giftbitRoutes.GiftbitRestError(cassava.httpStatusCode.clientError.UNAUTHORIZED);
    }

    const userUpdates: dynameh.UpdateExpressionAction[] = [];
    const userUpdateConditions: dynameh.Condition[] = [];
    const additionalCookies: { [key: string]: RouterResponseCookie } = {};
    if (userLogin.mfa.smsAuthState
        && userLogin.mfa.smsAuthState.action === "auth"
        && userLogin.mfa.smsAuthState.expiresDate >= createdDateNow()
        && userLogin.mfa.smsAuthState.code === params.code.toUpperCase()
    ) {
        // SMS
        userUpdates.push({
            action: "remove",
            attribute: "mfa.smsAuthState"
        });

        // With this condition login will fail unless this code has not been used yet.
        // This prevents racing a quick replay of the login.
        userUpdateConditions.push({
            operator: "attribute_exists",
            attribute: "mfa.smsAuthState"
        });
    } else if (userLogin.mfa.totpSecret && validateOtpCode(userLogin.mfa.totpSecret, params.code)) {
        // TOTP
        if (userLogin.mfa.totpUsedCodes[params.code]) {
            // This code has been used recently.  Login completion is not successful but this is not a serious failure.
            throw new giftbitRoutes.GiftbitRestError(cassava.httpStatusCode.clientError.UNAUTHORIZED);
        }

        const totpUsedCode: DbUserLogin.TotpUsedCode = {
            createdDate: createdDateNow()
        };
        userUpdates.push({
            action: "put",
            attribute: `mfa.totpUsedCodes.${params.code}`,
            value: totpUsedCode
        });

        // With this condition login will fail unless this code has not been used recently.
        // This prevents racing a quick replay of the login.
        userUpdateConditions.push({
            operator: "attribute_not_exists",
            attribute: `mfa.totpUsedCodes.${params.code}`
        });

        // Remove previously used codes that have expired.
        const usedCodeExpiration = new Date(Date.now() + totpUsedCodeTimeoutMillis).toISOString();
        for (const usedCode in userLogin.mfa.totpUsedCodes) {
            if (userLogin.mfa.totpUsedCodes.hasOwnProperty(usedCode) && userLogin.mfa.totpUsedCodes[usedCode].createdDate < usedCodeExpiration) {
                userUpdates.push({
                    action: "remove",
                    attribute: `mfa.totpUsedCodes.${usedCode}`
                });
            }
        }
    } else if (userLogin.mfa.backupCodes && userLogin.mfa.backupCodes[params.code.toUpperCase()]) {
        // Backup code
        userUpdates.push({
            action: "remove",
            attribute: `mfa.backupCodes.${params.code.toUpperCase()}`
        });

        // With this condition login will fail unless this backup code is not yet deleted.
        // This prevents racing a quick replay of the login.
        userUpdateConditions.push({
            operator: "attribute_exists",
            attribute: `mfa.backupCodes.${params.code.toUpperCase()}`
        });
    } else {
        log.warn("Could not log in user", auth.teamMemberId, "auth code did not match any known methods");
        await userLoginFailure(userLogin, params.sourceIp);
        throw new giftbitRoutes.GiftbitRestError(cassava.httpStatusCode.clientError.UNAUTHORIZED);
    }

    if (params.trustThisDevice) {
        const trustedDeviceToken = uuid().replace(/-/g, "");
        const trustedDevice: DbUserLogin.TrustedDevice = {
            createdDate: createdDateNow(),
            expiresDate: new Date(Date.now() + trustedDeviceExpirationDays * 24 * 60 * 60 * 1000).toISOString()
        };
        userUpdates.push({
            action: "put",
            attribute: `mfa.trustedDevices.${trustedDeviceToken}`,
            value: trustedDevice
        });
        additionalCookies["gb_ttd"] = {
            value: trustedDeviceToken,
            options: {
                httpOnly: true,
                maxAge: trustedDeviceExpirationDays * 24 * 60 * 60, // 14 days
                path: "/",
                secure: true
            }
        };
    }

    const userBadge = await userLoginSuccess(userLogin, userUpdates, userUpdateConditions);
    return {
        ...await DbUserLogin.getBadgeCookies(userBadge),
        ...additionalCookies
    };
}

async function userLoginSuccess(userLogin: DbUserLogin, additionalUpdates: dynameh.UpdateExpressionAction[] = [], updateConditions: dynameh.Condition[] = []): Promise<giftbitRoutes.jwtauth.AuthorizationBadge> {
    log.info("Logged in user", userLogin.email);

    // Store last login date.
    const userLoginUpdates: dynameh.UpdateExpressionAction[] = [
        {
            action: "put",
            attribute: "lastLoginDate",
            value: createdDateNow()
        },
        ...additionalUpdates
    ];

    if ((userLogin.failedLoginAttempts && userLogin.failedLoginAttempts.size > 0) || userLogin.lockedUntilDate) {
        // Clear failed login attempts.
        userLoginUpdates.push(
            {
                action: "remove",
                attribute: "failedLoginAttempts"
            },
            {
                action: "remove",
                attribute: "lockedUntilDate"
            }
        );
    }

    if (userLogin.mfa && userLogin.mfa.trustedDevices) {
        // Clear expired trusted devices.
        const now = createdDateNow();
        for (const trustedDeviceToken in userLogin.mfa.trustedDevices) {
            if (userLogin.mfa.trustedDevices.hasOwnProperty(trustedDeviceToken) && userLogin.mfa.trustedDevices[trustedDeviceToken].expiresDate > now) {
                userLoginUpdates.push({
                    action: "remove",
                    attribute: `mfa.trustedDevices.${trustedDeviceToken}`
                });
            }
        }
    }

    await DbUserLogin.conditionalUpdate(userLogin, userLoginUpdates, updateConditions);

    const teamMember = await DbTeamMember.getUserLoginTeamMembership(userLogin);
    if (!teamMember) {
        return DbUserLogin.getOrphanBadge(userLogin);
    }

    const liveMode = isTestModeUserId(userLogin.defaultLoginUserId);
    return DbUserLogin.getBadge(teamMember, liveMode, true);
}

async function userLoginFailure(userLogin: DbUserLogin, sourceIp: string): Promise<void> {
    const failedAttempt = `${createdDateNow()}, ${sourceIp}`;
    if (!userLogin.failedLoginAttempts) {
        userLogin.failedLoginAttempts = new Set();
    }
    userLogin.failedLoginAttempts.add(failedAttempt);

    if (userLogin.failedLoginAttempts.size < maxFailedLoginAttempts) {
        log.info("Storing failed login attempt for user", userLogin.email, "failedLoginAttempts.size=", userLogin.failedLoginAttempts.size);
        await DbUserLogin.update(userLogin, {
            action: "set_add",
            attribute: "failedLoginAttempts",
            values: new Set([failedAttempt])
        });
    } else {
        log.info("Too many failed login attempts for user", userLogin.email, Array.from(userLogin.failedLoginAttempts));

        const lockedUntilDate = new Date();
        lockedUntilDate.setMinutes(lockedUntilDate.getMinutes() + failedLoginTimoutMinutes);
        await DbUserLogin.update(userLogin,
            {
                action: "remove",
                attribute: "failedLoginAttempts"
            },
            {
                action: "put",
                attribute: "lockedUntilDate",
                value: lockedUntilDate.toISOString()
            });
        await sendFailedLoginTimeoutEmail(userLogin, failedLoginTimoutMinutes);
    }
}
