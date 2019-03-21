import * as cassava from "cassava";
import * as giftbitRoutes from "giftbit-cassava-routes";
import {sendForgotPasswordEmail} from "./sendForgotPasswordEmail";
import {dynamodb, tokenActionDynameh, userDynameh} from "../../../dynamodb";
import {TokenAction} from "../../../model/TokenAction";
import {UserPassword} from "../../../model/User";
import {hashPassword} from "../../../utils/passwordUtils";
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

    router.route("/v2/user/forgotPassword/reset")
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

            await forgotPasswordReset({
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

async function forgotPasswordReset(params: { token: string, plaintextPassword: string }): Promise<void> {
    const tokenActionReq = tokenActionDynameh.requestBuilder.buildGetInput(params.token);
    const tokenActionResp = await dynamodb.getItem(tokenActionReq).promise();
    const tokenAction: TokenAction = tokenActionDynameh.responseUnwrapper.unwrapGetOutput(tokenActionResp);
    if (!tokenAction || tokenAction.action !== "resetPassword") {
        log.warn("Could not find resetPassword TokenAction for token", params.token);
        throw new giftbitRoutes.GiftbitRestError(cassava.httpStatusCode.clientError.CONFLICT, "There was an error resetting the password.  Maybe the email link timed out.");
    }

    const userPassword: UserPassword = await hashPassword(params.plaintextPassword);

    const updateUserReq = userDynameh.requestBuilder.addCondition(
        userDynameh.requestBuilder.buildUpdateInputFromActions(
            {
                email: tokenAction.userEmail
            },
            {
                action: "put",
                attribute: "password",
                value: userPassword
            }
        ),
        {
            attribute: "email",
            operator: "attribute_exists"
        }
    );
    await dynamodb.updateItem(updateUserReq).promise();
    log.info("User", tokenAction.userEmail, "has reset their password");
}
