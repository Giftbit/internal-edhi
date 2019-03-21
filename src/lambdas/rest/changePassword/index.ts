import * as cassava from "cassava";
import * as giftbitRoutes from "giftbit-cassava-routes";
import {dynamodb, userDynameh} from "../../../dynamodb";
import {User, UserPassword} from "../../../model/User";
import {hashPassword, validatePassword} from "../../../utils/passwordUtils";
import log = require("loglevel");

export function installChangePasswordRest(router: cassava.Router): void {
    router.route("/v2/user/changePassword")
        .method("POST")
        .handler(async evt => {
            const auth: giftbitRoutes.jwtauth.AuthorizationBadge = evt.meta["auth"];
            auth.requireIds("teamMemberId");

            evt.validateBody({
                properties: {
                    oldPassword: {
                        type: "string"
                    },
                    newPassword: {
                        type: "string",
                        minLength: 8
                    }
                },
                required: ["oldPassword", "newPassword"],
                additionalProperties: false
            });

            await changePassword({
                auth,
                oldPlaintextPassword: evt.body.oldPassword,
                newPlaintextPassword: evt.body.newPassword
            });

            return {
                body: {},
                statusCode: cassava.httpStatusCode.success.OK
            };
        });
}

async function changePassword(params: { auth: giftbitRoutes.jwtauth.AuthorizationBadge, oldPlaintextPassword: string, newPlaintextPassword: string }): Promise<void> {
    const user: User = null;
    // TODO howa do I get the user from auth?

    if (!await validatePassword(params.oldPlaintextPassword, user.password)) {
        log.warn("Could change user password for", user.email, "old password did not validate");
        throw new giftbitRoutes.GiftbitRestError(cassava.httpStatusCode.clientError.UNAUTHORIZED);
    }

    const userPassword: UserPassword = await hashPassword(params.newPlaintextPassword);
    const updateUserReq = userDynameh.requestBuilder.addCondition(
        userDynameh.requestBuilder.buildUpdateInputFromActions(
            user,
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
    log.info("User", user.email, "has changed their password");
}
