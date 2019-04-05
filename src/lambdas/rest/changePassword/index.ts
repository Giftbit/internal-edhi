import * as cassava from "cassava";
import * as giftbitRoutes from "giftbit-cassava-routes";
import {hashPassword, validatePassword} from "../../../utils/passwordUtils";
import {DbUserLogin} from "../../../db/DbUserLogin";
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
    const userLogin = await DbUserLogin.getByAuth(params.auth);
    if (!userLogin) {
        throw new Error("Could not find UserLogin for valid auth.");
    }

    if (!await validatePassword(params.oldPlaintextPassword, userLogin.password)) {
        log.warn("Could change user password for", userLogin.email, "old password did not validate");
        throw new giftbitRoutes.GiftbitRestError(cassava.httpStatusCode.clientError.CONFLICT, "Old password does not match.");
    }

    const userPassword: DbUserLogin.Password = await hashPassword(params.newPlaintextPassword);
    await DbUserLogin.update(userLogin, {
        action: "put",
        attribute: "password",
        value: userPassword
    });
    log.info("User", userLogin.email, "has changed their password");
}
