import * as cassava from "cassava";
import * as giftbitRoutes from "giftbit-cassava-routes";
import {User, UserOrganization} from "../../../model/User";
import {dynamodb, userDynameh} from "../../../dynamodb";
import {validatePassword} from "../../../utils/passwordUtils";
import {RouterResponseCookie} from "cassava/dist/RouterResponse";
import log = require("loglevel");

let authConfig: Promise<giftbitRoutes.secureConfig.AuthenticationConfig>;
export function initializeBadgeSigningSecrets(authConfigPromise: Promise<giftbitRoutes.secureConfig.AuthenticationConfig>): void {
    authConfig = authConfigPromise;
}

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

            const user = await loginUser(evt.body);
            const userBadge = getUserBadge(user, true);

            return {
                body: null,
                statusCode: cassava.httpStatusCode.redirect.FOUND,
                headers: {
                    Location: `https://${process.env["LIGHTRAIL_WEBAPP_DOMAIN"]}/app/#`
                },
                cookies: await getUserBadgeCookies(userBadge)
            };
        });
}

async function loginUser(params: {email: string, password: string}): Promise<User> {
    const getUserReq = userDynameh.requestBuilder.buildGetInput(params.email);
    const getUserResp = await dynamodb.getItem(getUserReq).promise();
    const user: User = userDynameh.responseUnwrapper.unwrapGetOutput(getUserResp);

    if (!user) {
        throw new giftbitRoutes.GiftbitRestError(cassava.httpStatusCode.clientError.UNAUTHORIZED);
    }
    if (!await validatePassword(params.password, user.password)) {
        // TODO add to failed password attempts
        throw new giftbitRoutes.GiftbitRestError(cassava.httpStatusCode.clientError.UNAUTHORIZED);
    }

    return user;
}

function getUserOrganization(user: User, organizationId?: string): UserOrganization {
    if (!organizationId) {
        organizationId = user.defaultLoginOrganizationId;
    }
    if (organizationId.endsWith("-TEST")) {
        organizationId = organizationId.substring(0, organizationId.length - "_TEST".length);
    }
    if (user.organizations[organizationId]) {
        return user.organizations[organizationId];
    }

    const organizationIds = Object.keys(user.organizations);
    if (organizationIds.length > 0) {
        return user.organizations[organizationIds[0]];
    }

    log.error("Cannot get an organization for user", user.email, "organizations is empty");
    return null;
}

function getUserBadge(user: User, shortLived: boolean): giftbitRoutes.jwtauth.AuthorizationBadge {
    const userOrg = getUserOrganization(user);
    const badge = new giftbitRoutes.jwtauth.AuthorizationBadge(userOrg.jwtPayload);
    badge.issuer = "EDHI";
    badge.audience = shortLived ? "WEBAPP" : "API";
    badge.expirationTime = shortLived ? new Date(Date.now() + 180 * 60000) : null;
    badge.issuedAtTime = new Date();
    return badge;
}

async function getUserBadgeCookies(badge: giftbitRoutes.jwtauth.AuthorizationBadge): Promise<{[key: string]: RouterResponseCookie}> {
    if (!authConfig) {
        throw new Error("authConfig is not initialized");
    }

    const signed = badge.sign((await authConfig).secretkey);
    const signedBits = signed.split(".");
    if (signedBits.length !== 3) {
        throw new Error("Expected signedBits.length === 3");
    }

    return {
        "gb_jwt_session": {
            value: signedBits[0] + "." + signedBits[1],
            options: {
                httpOnly: false,
                path: "/",
                secure: true,
            }
        },
        "gb_jwt_signature": {
            value: signedBits[2],
            options: {
                httpOnly: true,
                maxAge: 30 * 60,
                path: "/",
                secure: true,
            }
        }
    };
}
