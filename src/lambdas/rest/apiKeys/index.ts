import * as cassava from "cassava";
import * as giftbitRoutes from "giftbit-cassava-routes";
import * as superagent from "superagent";
import * as uuid from "uuid/v4";
import {DbApiKey} from "../../../db/DbApiKey";
import {createdDateNow} from "../../../db/dynamodb";
import {ApiKey} from "../../../model/ApiKey";
import {DbUserLogin} from "../../../db/DbUserLogin";
import {isTestModeUserId, stripUserIdTestMode} from "../../../utils/userUtils";
import {DbAccountUser} from "../../../db/DbAccountUser";
import log = require("loglevel");

export function installApiKeysRest(router: cassava.Router): void {
    router.route("/v2/account/apiKeys")
        .method("GET")
        .handler(async evt => {
            const auth: giftbitRoutes.jwtauth.AuthorizationBadge = evt.meta["auth"];
            auth.requireScopes("lightrailV2:account:apiKeys:list");
            auth.requireIds("userId");

            const apiKeys = await DbApiKey.getAllForAccount(auth.userId);
            return {
                body: apiKeys.map(ApiKey.fromDbApiKey)
            };
        });

    router.route("/v2/account/apiKeys")
        .method("POST")
        .handler(async evt => {
            const auth: giftbitRoutes.jwtauth.AuthorizationBadge = evt.meta["auth"];
            auth.requireScopes("lightrailV2:account:apiKeys:create");

            evt.validateBody({
                properties: {
                    name: {
                        type: "string",
                        minLength: 1
                    }
                }
            });

            const apiKey = await createApiKey(auth, evt.body.name);
            return {
                body: apiKey,
                statusCode: cassava.httpStatusCode.success.CREATED
            };
        });

    router.route("/v2/account/apiKeys/{id}")
        .method("GET")
        .handler(async evt => {
            const auth: giftbitRoutes.jwtauth.AuthorizationBadge = evt.meta["auth"];
            auth.requireScopes("lightrailV2:account:apiKeys:read");
            auth.requireIds("userId");

            const apiKey = await DbApiKey.getByAccount(auth.userId, evt.pathParameters.id);
            if (!apiKey) {
                throw new giftbitRoutes.GiftbitRestError(cassava.httpStatusCode.clientError.NOT_FOUND, `Could not find api key with id '${evt.pathParameters.id}'.`, "ApiKeyNotFound");
            }
            return {
                body: ApiKey.fromDbApiKey(apiKey)
            };
        });

    router.route("/v2/account/apiKeys/{id}")
        .method("DELETE")
        .handler(async evt => {
            const auth: giftbitRoutes.jwtauth.AuthorizationBadge = evt.meta["auth"];
            auth.requireScopes("lightrailV2:account:apiKeys:delete");
            await deleteApiKey(auth, evt.pathParameters.id);
            return {
                body: {}
            };
        });
}

async function createApiKey(auth: giftbitRoutes.jwtauth.AuthorizationBadge, name: string): Promise<ApiKey> {
    auth.requireIds("userId", "teamMemberId");

    log.info("Creating API key for", auth.userId, auth.teamMemberId, "with name", name);

    const teamMember = await DbAccountUser.getByAuth(auth);
    const apiKey: DbApiKey = {
        userId: stripUserIdTestMode(auth.userId),
        teamMemberId: stripUserIdTestMode(auth.teamMemberId),
        name: name,
        tokenId: uuid().replace(/-/g, ""),
        tokenVersion: 3,
        roles: teamMember.roles,
        scopes: teamMember.scopes,
        createdDate: createdDateNow()
    };
    await DbApiKey.put(apiKey);

    const badge = DbUserLogin.getBadge(teamMember, isTestModeUserId(auth.userId), false);
    badge.uniqueIdentifier = apiKey.tokenId;
    const apiToken = await DbUserLogin.getBadgeApiToken(badge);

    log.info("Created API key with tokenId", apiKey.tokenId);

    return ApiKey.createResponse(apiKey, apiToken);
}

export async function deleteApiKeysForUser(auth: giftbitRoutes.jwtauth.AuthorizationBadge, teamMemberId: string): Promise<void> {
    auth.requireIds("userId");
    log.info("Deleting API keys for", auth.userId);

    const apiKeys = await DbApiKey.getAllForAccountUser(auth.userId, teamMemberId);
    for (const apiKey of apiKeys) {
        await revokeApiKey(apiKey);
        await DbApiKey.del(apiKey);
    }
}

async function deleteApiKey(auth: giftbitRoutes.jwtauth.AuthorizationBadge, tokenId: string): Promise<void> {
    auth.requireIds("userId");
    log.info("Deleting API key for", auth.userId, "with tokenId", tokenId);

    const apiKey = await DbApiKey.getByAccount(auth.userId, tokenId);
    if (!apiKey) {
        throw new giftbitRoutes.GiftbitRestError(cassava.httpStatusCode.clientError.NOT_FOUND, `Could not find api key with id '${tokenId}'.`, "ApiKeyNotFound");
    }

    await revokeApiKey(apiKey);
    await DbApiKey.del(apiKey);
}

/**
 * Revokes the API key in the external credentials service.
 */
async function revokeApiKey(apiKey: DbApiKey): Promise<void> {
    log.info("Revoking API key", apiKey.userId, apiKey.teamMemberId, apiKey.tokenId);

    const auth = new giftbitRoutes.jwtauth.AuthorizationBadge();
    auth.userId = apiKey.userId;
    auth.teamMemberId = apiKey.teamMemberId;
    auth.uniqueIdentifier = apiKey.tokenId;
    auth.roles = apiKey.roles;
    auth.scopes = apiKey.scopes;
    auth.issuer = "EDHI";
    auth.audience = "API";
    auth.expirationTime = new Date(Date.now() + 5 * 60000);
    auth.issuedAtTime = new Date();

    const token = await DbUserLogin.getBadgeApiToken(auth);

    await superagent.delete(`https://${process.env["LIGHTRAIL_DOMAIN"]}/v1/credentials`)
        .set("Authorization", `Bearer ${token}`)
        .timeout(3000)
        .retry(3);
}
