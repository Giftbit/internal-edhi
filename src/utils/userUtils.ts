import * as uuid from "uuid/v4";
import {User} from "../model/User";
import {
    dynamodb,
    teamMemberByTeamMemberIdDynameh,
    teamMemberDynameh,
    userByUserIdDynameh,
    userDynameh
} from "../dynamodb";
import * as giftbitRoutes from "giftbit-cassava-routes";
import {RouterResponseCookie} from "cassava/dist/RouterResponse";
import * as cassava from "cassava";
import {TeamMember} from "../model/TeamMember";
import log = require("loglevel");

let authConfig: Promise<giftbitRoutes.secureConfig.AuthenticationConfig>;

export function initializeBadgeSigningSecrets(authConfigPromise: Promise<giftbitRoutes.secureConfig.AuthenticationConfig>): void {
    authConfig = authConfigPromise;
}

export function generateUserId(): string {
    return "user-" + uuid().replace(/-/g, "");
}

export async function getUserByEmail(email: string): Promise<User> {
    log.debug("getUserByEmail", email);
    const getUserReq = userDynameh.requestBuilder.buildGetInput(email);
    const getUserResp = await dynamodb.getItem(getUserReq).promise();
    return userDynameh.responseUnwrapper.unwrapGetOutput(getUserResp);
}

export async function getUserByAuth(auth: giftbitRoutes.jwtauth.AuthorizationBadge): Promise<User> {
    auth.requireIds("teamMemberId");

    const userId = stripUserIdTestMode(auth.teamMemberId);
    const user = await getUserById(userId);
    if (!user) {
        log.error("Could not find user with userId", userId, "despite having a valid JWT");
        throw new giftbitRoutes.GiftbitRestError(cassava.httpStatusCode.clientError.FORBIDDEN);
    }

    return user;
}

export async function getUserById(userId: string): Promise<User> {
    const queryUserReq = userByUserIdDynameh.requestBuilder.buildQueryInput(stripUserIdTestMode(userId));
    const queryUserResp = await dynamodb.query(queryUserReq).promise();
    const users = await userByUserIdDynameh.responseUnwrapper.unwrapQueryOutput(queryUserResp);
    return users[0];
}

export async function getTeamMember(accountUserId: string, teamMemberId: string): Promise<TeamMember> {
    const req = teamMemberDynameh.requestBuilder.buildGetInput(stripUserIdTestMode(accountUserId), stripUserIdTestMode(teamMemberId));
    const resp = await dynamodb.getItem(req).promise();
    return teamMemberDynameh.responseUnwrapper.unwrapGetOutput(resp);
}

/**
 * Get all users on the given team.
 */
export async function getAccountTeamMembers(accountUserId: string): Promise<TeamMember[]> {
    const req = teamMemberDynameh.requestBuilder.buildQueryInput(stripUserIdTestMode(accountUserId));
    let resp = await dynamodb.query(req).promise();
    const teamUsers: TeamMember[] = teamMemberDynameh.responseUnwrapper.unwrapQueryOutput(resp);

    // TODO this should be a utility in dynameh
    while (resp.LastEvaluatedKey) {
        req.ExclusiveStartKey = resp.LastEvaluatedKey;
        resp = await dynamodb.query(req).promise();
        teamUsers.push(...teamMemberDynameh.responseUnwrapper.unwrapQueryOutput(resp));
    }

    return teamUsers;
}

/**
 * Get all teams for the given user.
 */
export async function getUserTeamMemberships(teamMemberId: string): Promise<TeamMember[]> {
    const req = teamMemberByTeamMemberIdDynameh.requestBuilder.buildQueryInput(stripUserIdTestMode(teamMemberId));
    let resp = await dynamodb.query(req).promise();
    const teamUsers: TeamMember[] = teamMemberByTeamMemberIdDynameh.responseUnwrapper.unwrapQueryOutput(resp);

    // TODO this should be a utility in dynameh
    while (resp.LastEvaluatedKey) {
        req.ExclusiveStartKey = resp.LastEvaluatedKey;
        resp = await dynamodb.query(req).promise();
        teamUsers.push(...teamMemberByTeamMemberIdDynameh.responseUnwrapper.unwrapQueryOutput(resp));
    }

    return teamUsers;
}

/**
 * Get the team member the given user should login as.
 */
export async function getUserLoginTeamMembership(user: User): Promise<TeamMember> {
    if (user.defaultLoginUserId) {
        const teamMember = await getTeamMember(user.defaultLoginUserId, user.userId);
        if (teamMember) {
            return teamMember;
        }
    }

    // Get any random TeamMember to log in as.
    const queryReq = teamMemberByTeamMemberIdDynameh.requestBuilder.buildQueryInput(user.userId);
    queryReq.Limit = 1;
    const queryResp = await dynamodb.query(queryReq).promise();
    const teamMembers: TeamMember[] = teamMemberByTeamMemberIdDynameh.responseUnwrapper.unwrapQueryOutput(queryResp);
    if (teamMembers && teamMembers.length) {
        return teamMembers[0];
    }

    return null;
}

export function getUserBadge(user: User, teamMember: TeamMember | null, liveMode: boolean, shortLived: boolean): giftbitRoutes.jwtauth.AuthorizationBadge {
    if (!teamMember) {
        // This is an orphaned user with no team.  All they can do is create
        // a new team.
        const auth = new giftbitRoutes.jwtauth.AuthorizationBadge();
        auth.teamMemberId = user.userId;
        auth.roles = [];
        auth.issuer = "EDHI";
        auth.audience = "WEBAPP";
        auth.expirationTime = new Date(Date.now() + 180 * 60000);
        auth.issuedAtTime = new Date();
        return auth;
    }

    const auth = new giftbitRoutes.jwtauth.AuthorizationBadge();
    auth.userId = teamMember.userId + (liveMode ? "" : "-TEST");
    auth.teamMemberId = teamMember.teamMemberId + (liveMode ? "" : "-TEST");
    auth.roles = teamMember.roles;
    auth.issuer = "EDHI";
    auth.audience = shortLived ? "WEBAPP" : "API";
    auth.expirationTime = shortLived ? new Date(Date.now() + 180 * 60000) : null;
    auth.issuedAtTime = new Date();
    return auth;
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

export function stripUserIdTestMode(userId: string): string {
    if (userId.endsWith("-TEST")) {
        userId = userId.substring(0, userId.length - 5);
    }
    return userId;
}
