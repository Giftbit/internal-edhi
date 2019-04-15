import * as cassava from "cassava";
import * as giftbitRoutes from "giftbit-cassava-routes";
import {createdDateNow} from "../../../db/dynamodb";
import {validatePassword} from "../../../utils/passwordUtils";
import {sendEmailAddressVerificationEmail} from "../registration/sendEmailAddressVerificationEmail";
import {DbTeamMember} from "../../../db/DbTeamMember";
import {DbUserLogin} from "../../../db/DbUserLogin";
import {isTestModeUserId} from "../../../utils/userUtils";
import {sendSmsMfaChallenge} from "../mfa";
import {sendFailedLoginTimeoutEmail} from "./failedLoginManagement";
import * as dynameh from "dynameh";
import log = require("loglevel");

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

            const userBadge = await loginUser({
                email: evt.body.email,
                plaintextPassword: evt.body.password,
                sourceIp: evt.requestContext.identity.sourceIp
            });

            return {
                body: null,
                statusCode: cassava.httpStatusCode.redirect.FOUND,
                headers: {
                    Location: `https://${process.env["LIGHTRAIL_WEBAPP_DOMAIN"]}/app/#`
                },
                cookies: await DbUserLogin.getBadgeCookies(userBadge)
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
            await sendSmsMfaChallenge(userLogin);
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

            const userBadge = await completeMfaLogin(auth, {
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
                cookies: await DbUserLogin.getBadgeCookies(userBadge)
            };
        });
}

async function loginUser(params: { email: string, plaintextPassword: string, sourceIp: string }): Promise<giftbitRoutes.jwtauth.AuthorizationBadge> {
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

    if (userLogin.mfa && userLogin.mfa.smsDevice) {
        log.info("Logged in user", params.email);

        await sendSmsMfaChallenge(userLogin);
        return DbUserLogin.getAdditionalAuthenticationRequiredBadge(userLogin);
    }

    return userLoginSuccess(userLogin);
}

async function completeMfaLogin(auth: giftbitRoutes.jwtauth.AuthorizationBadge, params: { code: string, trustThisDevice?: boolean, sourceIp: string }): Promise<giftbitRoutes.jwtauth.AuthorizationBadge> {
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

    // TODO trustThisDevice support

    if (userLogin.mfa.smsAuthState
        && userLogin.mfa.smsAuthState.action === "auth"
        && userLogin.mfa.smsAuthState.dateExpires >= createdDateNow()
        && userLogin.mfa.smsAuthState.code === params.code.toUpperCase()
    ) {
        return userLoginSuccess(userLogin);
    }

    if (userLogin.mfa.backupCodes && userLogin.mfa.backupCodes.has(params.code.toUpperCase())) {
        await DbUserLogin.update(userLogin, {
            action: "set_delete",
            attribute: "mfa.backupCodes",
            values: new Set([params.code.toUpperCase()])
        });
        return userLoginSuccess(userLogin);
    }

    log.warn("Could not log in user", auth.teamMemberId, "auth code did not match any known methods");
    await userLoginFailure(userLogin, params.sourceIp);
    throw new giftbitRoutes.GiftbitRestError(cassava.httpStatusCode.clientError.UNAUTHORIZED);
}

async function userLoginSuccess(userLogin: DbUserLogin): Promise<giftbitRoutes.jwtauth.AuthorizationBadge> {
    log.info("Logged in user", userLogin.email);

    const userLoginUpdates: dynameh.UpdateExpressionAction[] = [{
        action: "put",
        attribute: "lastLoginDate",
        value: createdDateNow()
    }];

    if ((userLogin.failedLoginAttempts && userLogin.failedLoginAttempts.size > 0) || userLogin.lockedUntilDate) {
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
    if (userLogin.mfa && userLogin.mfa.smsAuthState) {
        userLoginUpdates.push({
            action: "remove",
            attribute: "mfa.smsAuthState"
        });
    }

    await DbUserLogin.update(userLogin, ...userLoginUpdates);

    const teamMember = await DbTeamMember.getUserLoginTeamMembership(userLogin);
    if (!teamMember) {
        return DbUserLogin.getOrphanBadge(userLogin);
    }

    const liveMode = isTestModeUserId(userLogin.defaultLoginUserId);
    return DbUserLogin.getBadge(teamMember, liveMode, true);
}

const maxFailedLoginAttempts = 10;
const failedLoginTimoutMinutes = 60;

export async function userLoginFailure(userLogin: DbUserLogin, sourceIp: string): Promise<void> {
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
