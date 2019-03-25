import {User, UserOrganization} from "../model/User";
import {dynamodb, userbyUserIdDynameh, userDynameh} from "../dynamodb";
import * as giftbitRoutes from "giftbit-cassava-routes";
import {RouterResponseCookie} from "cassava/dist/RouterResponse";
import * as cassava from "cassava";
import log = require("loglevel");

let authConfig: Promise<giftbitRoutes.secureConfig.AuthenticationConfig>;

export function initializeBadgeSigningSecrets(authConfigPromise: Promise<giftbitRoutes.secureConfig.AuthenticationConfig>): void {
    authConfig = authConfigPromise;
}

export async function getUserByEmail(email: string): Promise<User> {
    log.debug("getUserByEmail", email);
    const getUserReq = userDynameh.requestBuilder.buildGetInput(email);
    const getUserResp = await dynamodb.getItem(getUserReq).promise();
    return userDynameh.responseUnwrapper.unwrapGetOutput(getUserResp);
}

export async function getUserByAuth(auth: giftbitRoutes.jwtauth.AuthorizationBadge): Promise<User> {
    auth.requireIds("teamMemberId");

    let userId = auth.teamMemberId;
    if (userId.endsWith("-TEST")) {
        userId = /(.*)-TEST/.exec(userId)[1];
    }

    // We get a partial user because we're not projecting all the keys.  If this is an operation
    // we're going to do a lot then maybe we should.
    const partialUser = await getPartialUserByUserId(userId);
    if (!partialUser) {
        log.warn("Could not find user with userId", userId);
        throw new giftbitRoutes.GiftbitRestError(cassava.httpStatusCode.clientError.FORBIDDEN);
    }

    const user = await getUserByEmail(partialUser.email);
    if (!user) {
        log.error("Could not find user with email", partialUser.email, "despite finding the secondary index entry for it", partialUser);
        throw new giftbitRoutes.GiftbitRestError(cassava.httpStatusCode.clientError.FORBIDDEN);
    }

    return user;
}

/**
 * Get a projection of the User by userId.  This projection is controlled by
 * the GlobalSecondaryIndex Projection.  More attributes can be added to the
 * projection but this adds cost and should be done sparingly.
 */
export async function getPartialUserByUserId(userId: string): Promise<{ userId: string, email: string }> {
    if (userId.endsWith("-TEST")) {
        userId = /(.*)-TEST/.exec(userId)[1];
    }

    const queryUserReq = userbyUserIdDynameh.requestBuilder.buildQueryInput(userId);
    const queryUserResp = await dynamodb.query(queryUserReq).promise();
    const users = await userbyUserIdDynameh.responseUnwrapper.unwrapQueryOutput(queryUserResp);
    return users[0];
}

function getUserOrganization(user: User, organizationId?: string): UserOrganization {
    if (!organizationId) {
        organizationId = user.defaultLoginUserId;
    }
    if (!organizationId) {
        organizationId = Object.keys(user.organizations)[0];
    }
    if (!organizationId) {
        log.error("Cannot get an organization for user", user.email, "organizations is empty");
        return null;
    }
    if (organizationId.endsWith("-TEST")) {
        organizationId = /(.*)-TEST/.exec(organizationId)[1];
    }
    if (!user.organizations[organizationId]) {
        organizationId = Object.keys(user.organizations)[0];
    }
    if (!user.organizations[organizationId]) {
        log.error("Cannot get an organization for user", user.email, "organizations is empty");
        return null;

    }

    return user.organizations[organizationId];
}

export function getUserBadge(user: User, shortLived: boolean): giftbitRoutes.jwtauth.AuthorizationBadge {
    const userOrg = getUserOrganization(user);
    const badge = new giftbitRoutes.jwtauth.AuthorizationBadge(userOrg.jwtPayload);
    badge.issuer = "EDHI";
    badge.audience = shortLived ? "WEBAPP" : "API";
    badge.expirationTime = shortLived ? new Date(Date.now() + 180 * 60000) : null;
    badge.issuedAtTime = new Date();
    return badge;
}

export async function getUserBadgeCookies(badge: giftbitRoutes.jwtauth.AuthorizationBadge): Promise<{ [key: string]: RouterResponseCookie }> {
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
                secure: true
            }
        },
        "gb_jwt_signature": {
            value: signedBits[2],
            options: {
                httpOnly: true,
                maxAge: 30 * 60,
                path: "/",
                secure: true
            }
        }
    };
}
