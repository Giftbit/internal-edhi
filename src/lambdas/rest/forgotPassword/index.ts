import * as cassava from "cassava";
import * as giftbitRoutes from "giftbit-cassava-routes";
import {sendForgotPasswordEmail} from "./sendForgotPasswordEmail";
import {dynamodb, userDynameh} from "../../../dynamodb";
import {UserPassword} from "../../../model/User";
import {hashPassword} from "../../../utils/passwordUtils";
import {deleteTokenAction, getTokenAction} from "../../../utils/tokenActionUtils";
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

            await completeForgotPassword({
                token: evt.body.token,
                plaintextPassword: evt.body.password
            });

            return {
                body: null,
                statusCode: cassava.httpStatusCode.redirect.FOUND,
                headers: {
                    Location: `https://${process.env["LIGHTRAIL_WEBAPP_DOMAIN"]}/app/#`
                }
            };
        });
}

async function completeForgotPassword(params: { token: string, plaintextPassword: string }): Promise<void> {
    const tokenAction = await getTokenAction(params.token);
    if (!tokenAction || tokenAction.action !== "resetPassword") {
        log.warn("Could not find resetPassword TokenAction for token", params.token);
        throw new giftbitRoutes.GiftbitRestError(cassava.httpStatusCode.clientError.CONFLICT, "There was an error resetting the password.  Maybe the email link timed out.");
    }

    const userPassword: UserPassword = await hashPassword(params.plaintextPassword);
    const updateUserReq = userDynameh.requestBuilder.buildUpdateInputFromActions(
        {
            email: tokenAction.email
        },
        {
            action: "put",
            attribute: "password",
            value: userPassword
        }
    );
    userDynameh.requestBuilder.addCondition(updateUserReq, {
        attribute: "email",
        operator: "attribute_exists"
    });
    await dynamodb.updateItem(updateUserReq).promise();
    await deleteTokenAction(tokenAction);

    log.info("User", tokenAction.email, "has changed their password through forgotPassword");
}
