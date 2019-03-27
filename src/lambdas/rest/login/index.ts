import * as cassava from "cassava";
import * as giftbitRoutes from "giftbit-cassava-routes";
import {User} from "../../../model/User";
import {dateCreatedNow} from "../../../dynamodb";
import {validatePassword} from "../../../utils/passwordUtils";
import {addFailedLoginAttempt, clearFailedLoginAttempts} from "./failedLoginManagement";
import {sendEmailAddressVerificationEmail} from "../registration/sendEmailAddressVerificationEmail";
import {getUserBadge, getUserBadgeCookies, getUserByEmail, getUserLoginTeamMember} from "../../../utils/userUtils";
import log = require("loglevel");

export function installLoginRest(router: cassava.Router): void {
    router.route("/v2/user/login")
        .method("POST")
        .handler(async evt => {
            evt.validateBody({
                properties: {
                    email: {
                        type: "string"
                    },
                    password: {
                        type: "string"
                    }
                },
                required: ["email", "password"],
                additionalProperties: false
            });

            const user = await loginUser({
                email: evt.body.email,
                plaintextPassword: evt.body.password,
                sourceIp: evt.requestContext.identity.sourceIp
            });
            const teamMember = await getUserLoginTeamMember(user);
            const liveMode = user.defaultLoginUserId.endsWith("-TEST");
            const userBadge = getUserBadge(user, teamMember, liveMode, true);

            return {
                body: null,
                statusCode: cassava.httpStatusCode.redirect.FOUND,
                headers: {
                    Location: `https://${process.env["LIGHTRAIL_WEBAPP_DOMAIN"]}/app/#`
                },
                cookies: await getUserBadgeCookies(userBadge)
            };
        });

    router.route("/v2/user/logout")
        .handler(async () => {
            return {
                body: null,
                statusCode: cassava.httpStatusCode.redirect.FOUND,
                headers: {
                    Location: `https://${process.env["LIGHTRAIL_WEBAPP_DOMAIN"]}/app/#`
                },
                cookies: {
                    "gb_jwt_session": {
                        value: "",
                        options: {
                            httpOnly: false,
                            expires: new Date(0),   // Clears the cookie per RFC 6255.
                            path: "/",
                            secure: true,
                        }
                    },
                    "gb_jwt_signature": {
                        value: "",
                        options: {
                            httpOnly: true,
                            expires: new Date(0),
                            path: "/",
                            secure: true,
                        }
                    }
                }
            };
        });
}

async function loginUser(params: { email: string, plaintextPassword: string, sourceIp: string }): Promise<User> {
    const user = await getUserByEmail(params.email);

    if (!user) {
        log.warn("Could not log in user", params.email, "user not found");
        throw new giftbitRoutes.GiftbitRestError(cassava.httpStatusCode.clientError.UNAUTHORIZED);
    }
    if (!user.emailVerified) {
        log.warn("Could not log in user", params.email, "email is not verified");
        await sendEmailAddressVerificationEmail(user);
        throw new giftbitRoutes.GiftbitRestError(cassava.httpStatusCode.clientError.UNAUTHORIZED, "You must verify your email address before you can log in.  A new registration email has been sent to your email address.");
    }
    if (user.frozen) {
        log.warn("Could not log in user", params.email, "user is frozen");
        throw new giftbitRoutes.GiftbitRestError(cassava.httpStatusCode.clientError.UNAUTHORIZED);
    }
    if (user.lockedUntilDate && user.lockedUntilDate >= dateCreatedNow()) {
        log.warn("Could not log in user", params.email, "user is locked until", user.lockedUntilDate);
        throw new giftbitRoutes.GiftbitRestError(cassava.httpStatusCode.clientError.UNAUTHORIZED);
    }
    if (!await validatePassword(params.plaintextPassword, user.password)) {
        log.warn("Could not log in user", params.email, "password did not validate");
        await addFailedLoginAttempt(user, params.sourceIp);
        throw new giftbitRoutes.GiftbitRestError(cassava.httpStatusCode.clientError.UNAUTHORIZED);
    }

    log.info("Logged in user", params.email);
    await clearFailedLoginAttempts(user);
    return user;
}
