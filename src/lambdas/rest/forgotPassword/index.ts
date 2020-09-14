import * as cassava from "cassava";
import * as giftbitRoutes from "giftbit-cassava-routes";
import {sendForgotPasswordEmail} from "./sendForgotPasswordEmail";
import {loginUserByEmailAction} from "../login";
import {createdDateNow} from "../../../db/dynamodb";
import {DbUser} from "../../../db/DbUser";
import {completeChangePassword} from "../changePassword";
import {DbTokenAction} from "../../../db/DbTokenAction";
import {DbIpAction} from "../../../db/DbIpAction";
import log = require("loglevel");

export function installForgotPasswordRest(router: cassava.Router): void {
    router.route("/v2/user/forgotPassword")
        .method("POST")
        .handler(async evt => {
            evt.validateBody({
                type: "object",
                properties: {
                    email: {
                        type: "string",
                        format: "email"
                    }
                },
                required: ["email"],
                additionalProperties: false
            });

            return await startForgotPassword({
                email: evt.body.email,
                ip: evt.headersLowerCase["x-forwarded-for"].split(",")[0]
            });
        });

    router.route("/v2/user/forgotPassword/complete")
        .method("POST")
        .handler(async evt => {
            evt.validateBody({
                type: "object",
                properties: {
                    token: {
                        type: "string"
                    },
                    password: {
                        type: "string",
                        minLength: 8,
                        maxLength: 255
                    }
                },
                required: ["token", "password"],
                additionalProperties: false
            });

            return await completeForgotPassword({
                token: evt.body.token,
                plaintextPassword: evt.body.password
            });
        });
}

async function startForgotPassword(params: { email: string, ip: string }): Promise<cassava.RouterResponse> {
    if (!await DbIpAction.canTakeAction("forgotPassword", params.ip)) {
        throw new giftbitRoutes.GiftbitRestError(cassava.httpStatusCode.clientError.TOO_MANY_REQUESTS, "A large number of requests to reset password has been detected.  Please wait 24 hours.");
    }

    await sendForgotPasswordEmail(params.email);

    return {
        body: {},
        statusCode: cassava.httpStatusCode.success.OK
    };
}

async function completeForgotPassword(params: { token: string, plaintextPassword: string }): Promise<cassava.RouterResponse> {
    const tokenAction = await DbTokenAction.get(params.token);
    if (!tokenAction || tokenAction.action !== "resetPassword") {
        log.warn("Could not find resetPassword TokenAction for token", params.token);
        throw new giftbitRoutes.GiftbitRestError(cassava.httpStatusCode.clientError.CONFLICT, "There was an error resetting the password.  Maybe the email link timed out.");
    }

    const user = await DbUser.get(tokenAction.email);
    if (!user) {
        throw new Error(`Could not find User with email '${tokenAction.email}'.`);
    }

    await completeChangePassword(params.plaintextPassword, user, {
        // Because you can get here through recovering an account, which does require an email.
        action: "put",
        attribute: "login.emailVerified",
        value: true
    }, {
        // Because this will log them in.
        action: "put",
        attribute: "login.lastLoginDate",
        value: createdDateNow()
    });
    await DbTokenAction.del(tokenAction);

    log.info("User", user.email, "has changed their password through forgotPassword");

    return loginUserByEmailAction(user);
}
