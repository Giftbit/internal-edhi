import * as cassava from "cassava";
import * as giftbitRoutes from "giftbit-cassava-routes";
import {DbUserLogin} from "../../../db/DbUserLogin";
import {MfaStatus} from "../../../model/MfaStatus";
import {createdDateNow} from "../../../db/dynamodb";
import {sendSms} from "../../../utils/smsUtils";
import otplib = require("otplib");
import log = require("loglevel");

export function installMfaRest(router: cassava.Router): void {
    router.route("/v2/user/mfa")
        .method("GET")
        .handler(async evt => {
            const auth: giftbitRoutes.jwtauth.AuthorizationBadge = evt.meta["auth"];
            auth.requireScopes("lightrailV2:user:mfa:read");
            let trusted: boolean;
            if (auth.hasScope("lightrailV2:user:mfa:read")) {
                trusted = true;
            } else if (auth.hasScope("lightrailV2:user:mfa:authenticate")) {
                trusted = false;
            } else {
                throw new giftbitRoutes.GiftbitRestError(cassava.httpStatusCode.clientError.FORBIDDEN);
            }
            return {
                body: await getMfaStatus(auth, trusted)
            };
        });

    router.route("/v2/user/mfa")
        .method("POST")
        .handler(async evt => {
            const auth: giftbitRoutes.jwtauth.AuthorizationBadge = evt.meta["auth"];
            auth.requireScopes("lightrailV2:user:mfa:update");

            evt.validateBody({
                properties: {
                    device: {
                        type: "string",
                        minLength: 1
                    }
                },
                required: ["device"],
                additionalProperties: false
            });

            if (evt.body.device === "totp") {
                return {
                    body: await startEnableTotpMfa(auth),
                    headers: {
                        "Content-Type": "image-png"
                    }
                };
            }

            return {
                body: await startEnableSmsMfa(auth, evt.body)
            };
        });

    router.route("/v2/user/mfa/complete")
        .method("POST")
        .handler(async evt => {
            const auth: giftbitRoutes.jwtauth.AuthorizationBadge = evt.meta["auth"];
            auth.requireScopes("lightrailV2:user:mfa:update");

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

            const res = await completeEnableMfa(auth, evt.body);
            return {
                body: res,
                statusCode: res.complete ? cassava.httpStatusCode.success.OK : cassava.httpStatusCode.success.ACCEPTED
            };
        });

    router.route("/v2/user/mfa")
        .method("DELETE")
        .handler(async evt => {
            const auth: giftbitRoutes.jwtauth.AuthorizationBadge = evt.meta["auth"];
            auth.requireScopes("lightrailV2:user:mfa:delete");
            await disableMfa(auth);
            return {
                body: {}
            };
        });

    router.route("/v2/user/mfa/backupCodes")
        .method("GET")
        .handler(async evt => {
            const auth: giftbitRoutes.jwtauth.AuthorizationBadge = evt.meta["auth"];
            auth.requireScopes("lightrailV2:user:mfa:read");

            const userLogin = await DbUserLogin.getByAuth(auth);
            if (!userLogin.mfa) {
                throw new giftbitRoutes.GiftbitRestError(cassava.httpStatusCode.clientError.NOT_FOUND, "MFA is not enabled.");
            }
            const backupCodes = await getBackupCodes(userLogin);

            return {
                body: backupCodes
            };
        });
}

async function startEnableSmsMfa(auth: giftbitRoutes.jwtauth.AuthorizationBadge, params: { device: string }): Promise<{ message: string }> {
    log.info("Beginning MFA enable for", auth.teamMemberId);

    const userLogin = await DbUserLogin.getByAuth(auth);
    const code = generateCode();
    const smsAuthState: DbUserLogin.SmsAuthState = {
        action: "enable",
        code,
        device: params.device,
        createdDate: createdDateNow(),
        expiresDate: new Date(Date.now() + 3 * 60 * 1000).toISOString()
    };

    if (userLogin.mfa) {
        await DbUserLogin.update(userLogin, {
            attribute: "mfa.smsAuthState",
            action: "put",
            value: smsAuthState
        });
    } else {
        const mfa: DbUserLogin.Mfa = {
            smsAuthState,
            trustedDevices: {}
        };
        await DbUserLogin.update(userLogin, {
            attribute: "mfa",
            action: "put",
            value: mfa
        });
    }

    await sendSms({
        to: params.device,
        body: `Your Lightrail verification code is ${code}.`
    });

    return {
        message: `Code sent to ${params.device}`
    };
}

async function startEnableTotpMfa(auth: giftbitRoutes.jwtauth.AuthorizationBadge): Promise<{ secret: string }> {
    log.info("Beginning TOTP enable for", auth.teamMemberId);

    const userLogin = await DbUserLogin.getByAuth(auth);
    const secret = otplib.authenticator.generateSecret();
    const totpAuthState: DbUserLogin.TotpAuthState = {
        action: "enable",
        secret: secret, // TODO encrypt secret?
        lastCodes: [],
        createdDate: createdDateNow(),
        expiresDate: new Date(Date.now() + 5 * 60 * 1000).toISOString()
    };

    if (userLogin.mfa) {
        await DbUserLogin.update(userLogin, {
            attribute: "mfa.totpAuthState",
            action: "put",
            value: totpAuthState
        });
    } else {
        const mfa: DbUserLogin.Mfa = {
            totpAuthState,
            trustedDevices: {}
        };
        await DbUserLogin.update(userLogin, {
            attribute: "mfa",
            action: "put",
            value: mfa
        });
    }

    return {
        secret
    };

    // to complete:
    // require two successful secrets
    // cannot reuse codes in window
}

async function completeEnableMfa(auth: giftbitRoutes.jwtauth.AuthorizationBadge, params: { code: string }): Promise<{ complete: boolean, message: string }> {
    log.info("Completing MFA enable for", auth.teamMemberId);
    const userLogin = await DbUserLogin.getByAuth(auth);

    if (userLogin.mfa && userLogin.mfa.smsAuthState && userLogin.mfa.smsAuthState.action === "enable") {
        return await completeEnableSmsMfa(userLogin, params);
    }
    if (userLogin.mfa && userLogin.mfa.totpAuthState && userLogin.mfa.totpAuthState.action === "enable") {
        return await completeEnableTotpMfa(userLogin, params);
    }
    log.info("MFA not enabled for", auth.teamMemberId, "not in the process");
    throw new giftbitRoutes.GiftbitRestError(cassava.httpStatusCode.clientError.CONFLICT, "Not in the process of enabling MFA.");
}

async function completeEnableSmsMfa(userLogin: DbUserLogin, params: { code: string }): Promise<{ complete: boolean, message: string }> {
    if (userLogin.mfa.smsAuthState.expiresDate < createdDateNow()) {
        log.info("SMS MFA not enabled for", userLogin.email, "code expired");
        throw new giftbitRoutes.GiftbitRestError(cassava.httpStatusCode.clientError.CONFLICT, "Sorry, the code has expired.  Please try again.");
    }

    if (userLogin.mfa.smsAuthState.code !== params.code.toUpperCase()) {
        log.info("SMS MFA not enabled for", userLogin.email, "code", userLogin.mfa.smsAuthState.code, "does not match passed in", params.code);
        throw new giftbitRoutes.GiftbitRestError(cassava.httpStatusCode.clientError.CONFLICT, "Sorry, the code submitted was incorrect.");
    }

    await DbUserLogin.update(userLogin, {
        action: "remove",
        attribute: "mfa.smsAuthState"
    }, {
        action: "put",
        attribute: "mfa.smsDevice",
        value: userLogin.mfa.smsAuthState.device
    });
    log.info("Code matches, SMS MFA enabled for", userLogin.email, userLogin.mfa.smsAuthState.device);

    return {
        complete: true,
        message: "Success."
    };
}

async function completeEnableTotpMfa(userLogin: DbUserLogin, params: { code: string }): Promise<{ complete: boolean, message: string }> {
    if (userLogin.mfa.totpAuthState.expiresDate < createdDateNow()) {
        log.info("TOTP MFA not enabled for", userLogin.email, "the enable process has expired");
        throw new giftbitRoutes.GiftbitRestError(cassava.httpStatusCode.clientError.CONFLICT, "Sorry, the process to enable MFA has expired.  Please start again.");
    }

    if (userLogin.mfa.totpAuthState.lastCodes.indexOf(params.code) !== -1) {
        log.info("TOTP MFA not enabled for", userLogin.email, "code already seen");
        return {
            complete: false,
            message: "You have already entered this code.  Please enter the next code."
        };
    }

    if (!otplib.authenticator.check(params.code, userLogin.mfa.totpAuthState.secret)) {
        log.info("TOTP MFA not enabled for", userLogin.email, "code is invalid");
        throw new giftbitRoutes.GiftbitRestError(cassava.httpStatusCode.clientError.CONFLICT, "Sorry, the code submitted was incorrect.");
    }

    if (userLogin.mfa.totpAuthState.lastCodes.length > 0) {
        log.info("Code matches, TOTP MFA enabled for", userLogin.email);
        await DbUserLogin.update(userLogin, {
            action: "remove",
            attribute: "mfa.smsAuthState"
        }, {
            action: "put",
            attribute: "mfa.smsDevice",
            value: userLogin.mfa.smsAuthState.device
        });
        return {
            complete: true,
            message: "Success."
        };
    } else {
        log.info("Code matches, waiting for the next code for", userLogin.email);
        await DbUserLogin.update(userLogin, {
            action: "list_append",
            attribute: "mfa.totpAuthState.lastCodes",
            values: [params.code]
        });
        return {
            complete: false,
            message: "Code accepted.  Please enter the next code."
        };
    }
}

async function getMfaStatus(auth: giftbitRoutes.jwtauth.AuthorizationBadge, trusted: boolean): Promise<MfaStatus> {
    const userLogin = await DbUserLogin.getByAuth(auth);

    if (!userLogin.mfa) {
        throw new giftbitRoutes.GiftbitRestError(cassava.httpStatusCode.clientError.NOT_FOUND, "MFA is disabled.");
    }

    if (userLogin.mfa.smsDevice) {
        return {
            device: trusted ? userLogin.mfa.smsDevice : userLogin.mfa.smsDevice.replace(/./g, (match, offset, s) => offset < s.length - 4 ? "•" : match)
        };
    }
    if (userLogin.mfa.totpSecret) {
        return {
            device: "totp"
        };
    }

    throw new giftbitRoutes.GiftbitRestError(cassava.httpStatusCode.clientError.NOT_FOUND, "MFA is disabled.");
}

async function disableMfa(auth: giftbitRoutes.jwtauth.AuthorizationBadge): Promise<void> {
    const userLogin = await DbUserLogin.getByAuth(auth);
    await DbUserLogin.update(userLogin, {
        action: "remove",
        attribute: "mfa"
    });
}

export async function sendSmsMfaChallenge(userLogin: DbUserLogin): Promise<void> {
    if (!userLogin) {
        throw new Error("userLogin == null");
    }
    if (!userLogin.mfa || !userLogin.mfa.smsDevice) {
        throw new Error("User does not have SMS MFA enabled.");
    }

    const code = generateCode();
    const smsAuthState: DbUserLogin.SmsAuthState = {
        action: "auth",
        code,
        device: userLogin.mfa.smsDevice,
        createdDate: createdDateNow(),
        expiresDate: new Date(Date.now() + 3 * 60 * 1000).toISOString()
    };

    await DbUserLogin.update(userLogin, {
        attribute: "mfa.smsAuthState",
        action: "put",
        value: smsAuthState
    });
    await sendSms({
        to: userLogin.mfa.smsDevice,
        body: `Your Lightrail verification code is ${code}.`
    });
}

function generateCode(length: number = 6): string {
    const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    return Array(length).fill(null).map(() => alphabet[(Math.random() * alphabet.length) | 0]).join("");
}

async function getBackupCodes(userLogin: DbUserLogin): Promise<string[]> {
    if (!userLogin.mfa) {
        throw new Error("MFA is not enabled");
    }

    if (!userLogin.mfa.backupCodes) {
        const backupCodes: string[] = Array(10).fill(null).map(() => generateCode());
        await DbUserLogin.update(userLogin, {
            action: "put",
            attribute: "mfa.backupCodes",
            value: new Set(backupCodes)
        });
        return backupCodes;
    }

    return Array.from(userLogin.mfa.backupCodes);
}
