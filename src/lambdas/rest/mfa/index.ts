import * as cassava from "cassava";
import * as giftbitRoutes from "giftbit-cassava-routes";
import {DbUserLogin} from "../../../db/DbUserLogin";
import {MfaStatus} from "../../../model/MfaStatus";
import {dateCreatedNow} from "../../../db/dynamodb";
import {sendSms} from "../../../utils/twilioUtils";

export function installMfaRest(router: cassava.Router): void {
    router.route("/v2/user/mfa")
        .method("GET")
        .handler(async evt => {
            const auth: giftbitRoutes.jwtauth.AuthorizationBadge = evt.meta["auth"];
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
                properties: {
                    device: {
                        type: "code",
                        minLength: 1
                    }
                },
                required: ["code"],
                additionalProperties: false
            });

            return {
                body: await completeEnableMfa(auth, evt.body)
            };
        });

    router.route("/v2/user/mfa")
        .method("DELETE")
        .handler(async evt => {
            const auth: giftbitRoutes.jwtauth.AuthorizationBadge = evt.meta["auth"];
            auth.requireScopes("lightrailV2:user:mfa:update");
            await disableMfa(auth);
            return {
                body: {}
            };
        });

    router.route("/v2/user/mfa/backupCodes")
        .method("GET")
        .handler(async evt => {
            const auth: giftbitRoutes.jwtauth.AuthorizationBadge = evt.meta["auth"];

            const userLogin = await DbUserLogin.getByAuth(auth);
            if (!userLogin) {
                throw new Error(`Could not find authed user ${auth.teamMemberId}`);
            }
            if (!userLogin.mfa) {
                throw new giftbitRoutes.GiftbitRestError(cassava.httpStatusCode.clientError.NOT_FOUND, "MFA is not enabled.");
            }
            const backupCodes = await getBackupCodes(userLogin);

            return {
                body: backupCodes
            };
        });
}

async function startEnableMfa(auth: giftbitRoutes.jwtauth.AuthorizationBadge, params: { device: string }): Promise<{ message: string }> {
    const userLogin = await DbUserLogin.getByAuth(auth);
    const code = generateCode();

    const dateExpires = new Date();
    dateExpires.setMinutes(dateExpires.getMinutes() + 3);
    const smsAuthState: DbUserLogin.SmsAuthState = {
        action: "enable",
        code,
        device: params.device,
        dateCreated: dateCreatedNow(),
        dateExpires: dateExpires.toISOString()
    };

    await DbUserLogin.update(userLogin, {
        attribute: "mfa.smsAuthState",
        action: "put",
        value: smsAuthState
    });

    await sendSms({
        to: params.device,
        body: `Your Lightrail verification code is ${code}.`
    });

    return {
        message: `Code sent to ${params.device}`
    };
}

async function completeEnableMfa(auth: giftbitRoutes.jwtauth.AuthorizationBadge, params: { code: string }): Promise<{ message: string }> {
    const userLogin = await DbUserLogin.getByAuth(auth);

    if (userLogin.mfa
        && userLogin.mfa.smsAuthState
        && userLogin.mfa.smsAuthState.action === "enable"
        && userLogin.mfa.smsAuthState.dateExpires < dateCreatedNow()
        && userLogin.mfa.smsAuthState.code === params.code.toUpperCase()
    ) {
        await DbUserLogin.update(userLogin, {
            action: "remove",
            attribute: "mfa.smsAuthState"
        }, {
            action: "put",
            attribute: "mfa.smsDevice",
            value: userLogin.mfa.smsAuthState.device
        });
        return {
            message: "Success."
        };
    }

    return {
        message: "Sorry, the code submitted was incorrect."
    };
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

    throw new giftbitRoutes.GiftbitRestError(cassava.httpStatusCode.clientError.NOT_FOUND, "MFA is disabled.");
}

async function disableMfa(auth: giftbitRoutes.jwtauth.AuthorizationBadge): Promise<void> {
    const userLogin = await DbUserLogin.getByAuth(auth);
    await DbUserLogin.update(userLogin, {
        action: "remove",
        attribute: "mfa"
    });
}

function generateCode(length: number = 6): string {
    const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    return Array(length).fill(null).map(() => alphabet[Math.random() * alphabet.length]).join("");
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
