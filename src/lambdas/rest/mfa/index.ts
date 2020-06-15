import * as cassava from "cassava";
import * as giftbitRoutes from "giftbit-cassava-routes";
import * as otpUtils from "../../../utils/secretsUtils";
import {decryptSecret, encryptSecret} from "../../../utils/secretsUtils";
import {DbUser} from "../../../db/DbUser";
import {MfaStatus} from "../../../model/MfaStatus";
import {createdDateNow} from "../../../db/dynamodb";
import {sendSms} from "../../../utils/smsUtils";
import {CompleteEnableMfaResult} from "../../../model/CompleteEnableMfaResult";
import log = require("loglevel");

const maxEnableSmsMfaAttempts = 8;

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
                type: "object",
                properties: {
                    device: {
                        type: "string",
                        minLength: 1
                    }
                },
                required: ["device"],
                additionalProperties: false
            });

            return {
                body: await startEnableMfa(auth, evt.body)
            };
        });

    router.route("/v2/user/mfa/complete")
        .method("POST")
        .handler(async evt => {
            const auth: giftbitRoutes.jwtauth.AuthorizationBadge = evt.meta["auth"];
            auth.requireScopes("lightrailV2:user:mfa:update");

            evt.validateBody({
                type: "object",
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
                statusCode: res.complete ? cassava.httpStatusCode.success.OK : cassava.httpStatusCode.success.OK
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

            const user = await DbUser.getByAuth(auth);
            if (!user.login.mfa) {
                throw new giftbitRoutes.GiftbitRestError(cassava.httpStatusCode.clientError.NOT_FOUND, "MFA is not enabled.");
            }
            const backupCodes = await getOrCreateBackupCodes(user);

            return {
                body: backupCodes
            };
        });
}

function startEnableMfa(auth: giftbitRoutes.jwtauth.AuthorizationBadge, params: { device: string }): Promise<{ message?: string, secret?: string, uri?: string }> {
    if (params.device === "totp") {
        return startEnableTotpMfa(auth);
    } else {
        return startEnableSmsMfa(auth, params);
    }
}

async function startEnableSmsMfa(auth: giftbitRoutes.jwtauth.AuthorizationBadge, params: { device: string }): Promise<{ message: string }> {
    log.info("Beginning SMS MFA enable for", auth.teamMemberId);

    const user = await DbUser.getByAuth(auth);
    if (DbUser.limitedActions.count(user, "enableSmsMfa") > maxEnableSmsMfaAttempts) {
        log.info("User", user.userId, user.email, "has attempted to enable SMS MFA too many times and is prevented from trying further to prevent abuse.  Pretending the code sent anyways.");
        return {
            message: `Code sent to ${params.device}`
        };
    }

    const code = generateCode();
    const smsAuthState: DbUser.SmsAuthState = {
        action: "enable",
        code,
        device: params.device,
        createdDate: createdDateNow(),
        expiresDate: new Date(Date.now() + 3 * 60 * 1000).toISOString()
    };

    if (user.login.mfa) {
        await DbUser.update(user, {
            attribute: "login.mfa.smsAuthState",
            action: "put",
            value: smsAuthState
        }, DbUser.limitedActions.buildAddUpdateAction("enableSmsMfa"));
    } else {
        const mfa: DbUser.Mfa = {
            smsAuthState,
            trustedDevices: {}
        };
        await DbUser.update(user, {
            attribute: "login.mfa",
            action: "put",
            value: mfa
        }, DbUser.limitedActions.buildAddUpdateAction("enableSmsMfa"));
    }

    await sendSms({
        to: params.device,
        body: `Your Lightrail verification code is ${code}.`
    });

    return {
        message: `Code sent to ${params.device}`
    };
}

async function startEnableTotpMfa(auth: giftbitRoutes.jwtauth.AuthorizationBadge): Promise<{ secret: string, uri: string }> {
    log.info("Beginning TOTP MFA enable for", auth.teamMemberId);

    const user = await DbUser.getByAuth(auth);
    const secret = await otpUtils.generateTotpSecret();
    const totpSetup: DbUser.TotpSetup = {
        secret: secret.encryptedTotpSecret,
        lastCodes: [],
        createdDate: createdDateNow(),
        expiresDate: new Date(Date.now() + 5 * 60 * 1000).toISOString()
    };

    if (user.login.mfa) {
        await DbUser.update(user, {
            attribute: "login.mfa.totpSetup",
            action: "put",
            value: totpSetup
        });
    } else {
        const mfa: DbUser.Mfa = {
            totpSetup,
            trustedDevices: {}
        };
        await DbUser.update(user, {
            attribute: "login.mfa",
            action: "put",
            value: mfa
        });
    }

    return {
        secret: secret.totpSecret,
        uri: `otpauth://totp/Lightrail:${user.email}?secret=${secret.totpSecret}&period=30&digits=6&algorithm=SHA1&issuer=Lightrail`
    };
}

async function completeEnableMfa(auth: giftbitRoutes.jwtauth.AuthorizationBadge, params: { code: string }): Promise<CompleteEnableMfaResult> {
    log.info("Completing MFA enable for", auth.teamMemberId);
    const user = await DbUser.getByAuth(auth);

    if (user.login.mfa && user.login.mfa.smsAuthState && user.login.mfa.smsAuthState.action === "enable") {
        return await completeEnableSmsMfa(user, params);
    }
    if (user.login.mfa && user.login.mfa.totpSetup) {
        return await completeEnableTotpMfa(user, params);
    }
    log.info("MFA not enabled for", auth.teamMemberId, "not in the process");
    throw new giftbitRoutes.GiftbitRestError(cassava.httpStatusCode.clientError.CONFLICT, "Not in the process of enabling MFA.");
}

async function completeEnableSmsMfa(user: DbUser, params: { code: string }): Promise<CompleteEnableMfaResult> {
    if (user.login.mfa.smsAuthState.expiresDate < createdDateNow()) {
        log.info("SMS MFA not enabled for", user.userId, "code expired");
        throw new giftbitRoutes.GiftbitRestError(cassava.httpStatusCode.clientError.CONFLICT, "Sorry, the code has expired.  Please try again.");
    }

    if (user.login.mfa.smsAuthState.code !== params.code.toUpperCase()) {
        log.info("SMS MFA not enabled for", user.userId, "code", user.login.mfa.smsAuthState.code, "does not match passed in", params.code);
        throw new giftbitRoutes.GiftbitRestError(cassava.httpStatusCode.clientError.CONFLICT, "Sorry, the code submitted was incorrect.");
    }

    await DbUser.update(user, {
        action: "remove",
        attribute: "login.mfa.smsAuthState"
    }, {
        action: "put",
        attribute: "login.mfa.smsDevice",
        value: user.login.mfa.smsAuthState.device
    }, DbUser.limitedActions.buildClearUpdateAction("enableSmsMfa"));
    log.info("Code matches, SMS MFA enabled for", user.userId, user.login.mfa.smsAuthState.device);

    return {
        complete: true,
        message: "Success."
    };
}

async function completeEnableTotpMfa(user: DbUser, params: { code: string }): Promise<CompleteEnableMfaResult> {
    if (user.login.mfa.totpSetup.expiresDate < createdDateNow()) {
        log.info("TOTP MFA not enabled for", user.userId, "the enable process has expired");
        throw new giftbitRoutes.GiftbitRestError(cassava.httpStatusCode.clientError.CONFLICT, "Sorry, the process to enable MFA has expired.  Please start again.");
    }

    if (user.login.mfa.totpSetup.lastCodes.indexOf(params.code) !== -1) {
        log.info("TOTP MFA not enabled for", user.userId, "code already seen");
        throw new giftbitRoutes.GiftbitRestError(cassava.httpStatusCode.clientError.CONFLICT, "You have already entered this code.  Please enter the next code.");
    }

    if (!(await otpUtils.validateTotpCode(user.login.mfa.totpSetup.secret, params.code))) {
        log.info("TOTP MFA not enabled for", user.userId, "code is invalid");
        throw new giftbitRoutes.GiftbitRestError(cassava.httpStatusCode.clientError.CONFLICT, "Sorry, the code submitted was incorrect.");
    }

    if (user.login.mfa.totpSetup.lastCodes.length > 0) {
        log.info("Code matches, TOTP MFA enabled for", user.userId);
        await DbUser.update(user, {
            action: "remove",
            attribute: "login.mfa.totpSetup"
        }, {
            action: "put",
            attribute: "login.mfa.totpSecret",
            value: user.login.mfa.totpSetup.secret
        }, {
            action: "put",
            attribute: "login.mfa.totpUsedCodes",
            value: {}
        });
        return {
            complete: true,
            message: "Success."
        };
    } else {
        log.info("Code matches, waiting for the next code from", user.userId);
        await DbUser.update(user, {
            action: "list_append",
            attribute: "login.mfa.totpSetup.lastCodes",
            values: [params.code]
        });
        return {
            complete: false,
            message: "Code accepted.  Please enter the next code."
        };
    }
}

async function getMfaStatus(auth: giftbitRoutes.jwtauth.AuthorizationBadge, trusted: boolean): Promise<MfaStatus> {
    const user = await DbUser.getByAuth(auth);

    if (user.login.mfa && user.login.mfa.smsDevice) {
        return {
            device: trusted ? user.login.mfa.smsDevice : user.login.mfa.smsDevice.replace(/./g, (match, offset, s) => offset < s.length - 4 ? "•" : match)
        };
    }
    if (user.login.mfa && user.login.mfa.totpSecret) {
        return {
            device: "totp"
        };
    }

    throw new giftbitRoutes.GiftbitRestError(cassava.httpStatusCode.clientError.NOT_FOUND, "MFA is disabled.");
}

async function disableMfa(auth: giftbitRoutes.jwtauth.AuthorizationBadge): Promise<void> {
    const user = await DbUser.getByAuth(auth);
    await DbUser.update(user, {
        action: "remove",
        attribute: "login.mfa"
    });
}

export async function sendSmsMfaChallenge(user: DbUser): Promise<void> {
    if (!user) {
        throw new Error("user == null");
    }
    if (!user.login.mfa || !user.login.mfa.smsDevice) {
        throw new Error("User does not have SMS MFA enabled.");
    }

    const code = generateCode();
    const smsAuthState: DbUser.SmsAuthState = {
        action: "auth",
        code,
        device: user.login.mfa.smsDevice,
        createdDate: createdDateNow(),
        expiresDate: new Date(Date.now() + 3 * 60 * 1000).toISOString()
    };

    await DbUser.update(user, {
        attribute: "login.mfa.smsAuthState",
        action: "put",
        value: smsAuthState
    });
    await sendSms({
        to: user.login.mfa.smsDevice,
        body: `Your Lightrail verification code is ${code}.`
    });
}

function generateCode(length: number = 6): string {
    const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    return Array(length).fill(null).map(() => alphabet[(Math.random() * alphabet.length) | 0]).join("");
}

/**
 * Generate a number of codes with no duplicates.
 */
function generateUniqueCodes(count: number, length: number = 6): string[] {
    const codes = new Array(count).fill(null).map(() => generateCode(length));
    if (codes.some((code, ix) => codes.indexOf(code) !== ix)) {
        // Has duplicate.
        return generateUniqueCodes(count, length);
    }
    return codes;
}

async function getOrCreateBackupCodes(user: DbUser): Promise<string[]> {
    if (!user.login.mfa) {
        throw new Error("MFA is not enabled");
    }

    if (!user.login.mfa.backupCodes || !Object.keys(user.login.mfa.backupCodes).length) {
        const unencryptedCodes = generateUniqueCodes(10);
        const createdDate = createdDateNow();

        const backupCodes: { [code: string]: DbUser.BackupCode } = {};
        for (const code of unencryptedCodes) {
            backupCodes[await encryptSecret(code)] = {createdDate};
        }
        await DbUser.update(user, {
            action: "put",
            attribute: "login.mfa.backupCodes",
            value: backupCodes
        });

        return unencryptedCodes;
    }

    return Promise.all(Object.keys(user.login.mfa.backupCodes).map(decryptSecret));
}
