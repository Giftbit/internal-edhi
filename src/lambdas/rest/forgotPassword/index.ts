import * as cassava from "cassava";
import * as giftbitRoutes from "giftbit-cassava-routes";
import {sendForgotPasswordEmail} from "./sendForgotPasswordEmail";
import {hashPassword} from "../../../utils/passwordUtils";
import {TokenAction} from "../../../db/TokenAction";
import {DbUserLogin} from "../../../db/DbUserLogin";
import {getLoginResponse} from "../login";
import {DbAccountUser} from "../../../db/DbAccountUser";
import {createdDateNow} from "../../../db/dynamodb";
import log = require("loglevel");

export function installForgotPasswordRest(router: cassava.Router): void {
    router.route("/v2/user/forgotPassword")
        .method("POST")
        .handler(async evt => {
            evt.validateBody({
                properties: {
                    email: {
                        type: "string",
                        format: "email"
                    }
                },
                required: ["email"],
                additionalProperties: false
            });

            await sendForgotPasswordEmail(evt.body.email);

            return {
                body: {},
                statusCode: cassava.httpStatusCode.success.OK
            };
        });

    router.route("/v2/user/forgotPassword/complete")
        .method("POST")
        .handler(async evt => {
            evt.validateBody({
                properties: {
                    token: {
                        type: "string"
                    },
                    password: {
                        type: "string",
                        minLength: 8
                    }
                },
                required: ["token", "password"],
                additionalProperties: false
            });

            const resp = await completeForgotPassword({
                token: evt.body.token,
                plaintextPassword: evt.body.password
            });
            return resp;
        });
}

async function completeForgotPassword(params: { token: string, plaintextPassword: string }): Promise<cassava.RouterResponse> {
    const tokenAction = await TokenAction.get(params.token);
    if (!tokenAction || tokenAction.action !== "resetPassword") {
        log.warn("Could not find resetPassword TokenAction for token", params.token);
        throw new giftbitRoutes.GiftbitRestError(cassava.httpStatusCode.clientError.CONFLICT, "There was an error resetting the password.  Maybe the email link timed out.");
    }

    const userLogin = await DbUserLogin.get(tokenAction.email);
    if (!userLogin) {
        throw new Error(`Could not find UserLogin for user '${tokenAction.email}'.`);
    }

    const userPassword: DbUserLogin.Password = await hashPassword(params.plaintextPassword);
    await DbUserLogin.update(userLogin, {
        action: "put",
        attribute: "password",
        value: userPassword
    }, {
        // Because you can get here through recovering an account, which does require an email.
        action: "put",
        attribute: "emailVerified",
        value: true
    }, {
        // Because this will log them in.
        action: "put",
        attribute: "lastLoginDate",
        value: createdDateNow()
    });
    await TokenAction.del(tokenAction);

    log.info("User", userLogin.email, "has changed their password through forgotPassword");

    const accountUser = await DbAccountUser.getForUserLogin(userLogin);
    return getLoginResponse(userLogin, accountUser, true);
}
