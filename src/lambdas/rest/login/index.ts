import * as cassava from "cassava";
import * as giftbitRoutes from "giftbit-cassava-routes";
import {dateCreatedNow} from "../../../db/dynamodb";
import {validatePassword} from "../../../utils/passwordUtils";
import {addFailedLoginAttempt, clearFailedLoginAttempts} from "./failedLoginManagement";
import {sendEmailAddressVerificationEmail} from "../registration/sendEmailAddressVerificationEmail";
import {DbTeamMember} from "../../../db/DbTeamMember";
import {DbUserLogin} from "../../../db/DbUserLogin";
import {isTestModeUserId} from "../../../utils/userUtils";
import {sendSmsMfaChallenge} from "../mfa";
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
                    }
                },
                required: ["code"],
                additionalProperties: false
            });

            const userBadge = await completeMfaLogin(auth, {
                code: evt.body.code,
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
    if (userLogin.lockedUntilDate && userLogin.lockedUntilDate >= dateCreatedNow()) {
        log.warn("Could not log in user", params.email, "user is locked until", userLogin.lockedUntilDate);
        throw new giftbitRoutes.GiftbitRestError(cassava.httpStatusCode.clientError.UNAUTHORIZED);
    }
    if (!await validatePassword(params.plaintextPassword, userLogin.password)) {
        log.warn("Could not log in user", params.email, "password did not validate");
        await addFailedLoginAttempt(userLogin, params.sourceIp);
        throw new giftbitRoutes.GiftbitRestError(cassava.httpStatusCode.clientError.UNAUTHORIZED);
    }

    if (userLogin.mfa && userLogin.mfa.smsDevice) {
        log.info("Logged in user", params.email);

        await sendSmsMfaChallenge(userLogin);
        return DbUserLogin.getAdditionalAuthenticationRequiredBadge(userLogin);
    }

    return getLoginBadge(userLogin);
}

async function completeMfaLogin(auth: giftbitRoutes.jwtauth.AuthorizationBadge, params: { code: string, sourceIp: string }): Promise<giftbitRoutes.jwtauth.AuthorizationBadge> {
    const userLogin = await DbUserLogin.getByAuth(auth);

    if (userLogin.frozen) {
        log.warn("Could not log in user", auth.teamMemberId, "user is frozen");
        throw new giftbitRoutes.GiftbitRestError(cassava.httpStatusCode.clientError.UNAUTHORIZED);
    }
    if (userLogin.lockedUntilDate && userLogin.lockedUntilDate >= dateCreatedNow()) {
        log.warn("Could not log in user", auth.teamMemberId, "user is locked until", userLogin.lockedUntilDate);
        throw new giftbitRoutes.GiftbitRestError(cassava.httpStatusCode.clientError.UNAUTHORIZED);
    }
    if (!userLogin.mfa) {
        log.warn("Could not log in user", auth.teamMemberId, "MFA is not enabled");
        throw new giftbitRoutes.GiftbitRestError(cassava.httpStatusCode.clientError.UNAUTHORIZED);
    }

    if (userLogin.mfa.smsAuthState
        && userLogin.mfa.smsAuthState.action === "auth"
        && userLogin.mfa.smsAuthState.dateExpires >= dateCreatedNow()
        && userLogin.mfa.smsAuthState.code === params.code.toUpperCase()
    ) {
        // clear smsAuthState?
        return getLoginBadge(userLogin);
    }

    if (userLogin.mfa.backupCodes && userLogin.mfa.backupCodes.has(params.code.toUpperCase())) {
        await DbUserLogin.update(userLogin, {
            action: "set_delete",
            attribute: "mfa.backupCodes",
            values: new Set([params.code.toUpperCase()])
        });
        return getLoginBadge(userLogin);
    }

    log.warn("Could not log in user", auth.teamMemberId, "auth code did not match any known methods");
    await addFailedLoginAttempt(userLogin, params.sourceIp);
    throw new giftbitRoutes.GiftbitRestError(cassava.httpStatusCode.clientError.UNAUTHORIZED);
}

async function getLoginBadge(userLogin: DbUserLogin): Promise<giftbitRoutes.jwtauth.AuthorizationBadge> {
    log.info("Logged in user", userLogin.email);
    await clearFailedLoginAttempts(userLogin);

    const teamMember = await DbTeamMember.getUserLoginTeamMembership(userLogin);
    if (!teamMember) {
        return DbUserLogin.getOrphanBadge(userLogin);
    }

    const liveMode = isTestModeUserId(userLogin.defaultLoginUserId);
    return DbUserLogin.getBadge(teamMember, liveMode, true);
}
