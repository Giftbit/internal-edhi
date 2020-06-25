import * as cassava from "cassava";
import * as giftbitRoutes from "giftbit-cassava-routes";
import {DbApiKey} from "../../../db/DbApiKey";
import {createdDateNow} from "../../../db/dynamodb";
import {ApiKey} from "../../../model/ApiKey";
import {DbAccountUser} from "../../../db/DbAccountUser";
import {DbUser} from "../../../db/DbUser";
import {sendSqsMessage} from "../../../utils/sqsUtils";
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
                type: "object",
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

    const accountUser = await DbAccountUser.getByAuth(auth);
    const apiKey: DbApiKey = {
        accountId: auth.userId,
        userId: auth.teamMemberId,
        name: name,
        tokenId: DbApiKey.generateTokenId(),
        tokenVersion: 3,
        roles: accountUser.roles,
        scopes: accountUser.scopes,
        createdDate: createdDateNow()
    };

    const badge = DbApiKey.getBadge(apiKey);
    const apiToken = await DbUser.getBadgeApiToken(badge);
    apiKey.tokenHash = DbApiKey.getTokenHash(apiToken);
    await DbApiKey.put(apiKey);

    log.info("Created API key with tokenId", apiKey.tokenId);

    return ApiKey.createResponse(apiKey, apiToken);
}

async function deleteApiKey(auth: giftbitRoutes.jwtauth.AuthorizationBadge, tokenId: string): Promise<void> {
    auth.requireIds("userId");
    log.info("Deleting API key for", auth.userId, "with tokenId", tokenId);

    const apiKey = await DbApiKey.getByAccount(auth.userId, tokenId);
    if (!apiKey) {
        throw new giftbitRoutes.GiftbitRestError(cassava.httpStatusCode.clientError.NOT_FOUND, `Could not find api key with id '${tokenId}'.`, "ApiKeyNotFound");
    }

    await DbApiKey.del(apiKey);
    await sendSqsMessage(process.env["API_KEY_BLOCKLISTER_QUEUE_URL"], {apiKeyTokenId: apiKey.tokenId});
}
