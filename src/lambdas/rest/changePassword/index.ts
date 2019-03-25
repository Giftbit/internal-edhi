import * as cassava from "cassava";
import * as giftbitRoutes from "giftbit-cassava-routes";
import {dynamodb, userDynameh} from "../../../dynamodb";
import {UserPassword} from "../../../model/User";
import {hashPassword, validatePassword} from "../../../utils/passwordUtils";
import {getPartialUserByUserId, getUserByEmail} from "../login";
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
    let userId = params.auth.teamMemberId;
    if (userId.endsWith("-TEST")) {
        userId = /(.*)-TEST/.exec(userId)[1];
    }
    const partialUser = await getPartialUserByUserId(params.auth.teamMemberId);
    if (!partialUser) {
        log.warn("Could not change password for teamMemberId", params.auth.teamMemberId, "could not find user with that userId");
        throw new giftbitRoutes.GiftbitRestError(cassava.httpStatusCode.clientError.FORBIDDEN);
    }

    // `password` is not on the projection of User by userId.  We only need it to change password and this is a rare operation
    // so it makes more sense to do a second lookup than add it to the projection.
    const user = await getUserByEmail(partialUser.email);
    if (!user) {
        log.warn("Could not change password for teamMemberId", params.auth.teamMemberId, "could not find user with email", partialUser.email);
        throw new giftbitRoutes.GiftbitRestError(cassava.httpStatusCode.clientError.FORBIDDEN);
    }

    if (!await validatePassword(params.oldPlaintextPassword, user.password)) {
        log.warn("Could change user password for", user.email, "old password did not validate");
        throw new giftbitRoutes.GiftbitRestError(cassava.httpStatusCode.clientError.CONFLICT, "Old password does not match.");
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
