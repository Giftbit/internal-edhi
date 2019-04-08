import * as cassava from "cassava";
import * as giftbitRoutes from "giftbit-cassava-routes";
import * as uuid from "uuid/v4";
import {DbApiKey} from "../../../db/DbApiKey";
import {DbTeamMember} from "../../../db/DbTeamMember";
import {dateCreatedNow} from "../../../db/dynamodb";
import {ApiKey} from "../../../model/ApiKey";
import {DbUserLogin} from "../../../db/DbUserLogin";
import {isTestModeUserId, stripUserIdTestMode} from "../../../utils/userUtils";
import log = require("loglevel");

export function installApiKeysRest(router: cassava.Router): void {
    router.route("/v2/user/apiKeys")
        .method("GET")
        .handler(async evt => {
            const auth: giftbitRoutes.jwtauth.AuthorizationBadge = evt.meta["auth"];
            auth.requireIds("userId");

            const apiKeys = await DbApiKey.getAllForAccount(auth.userId);
            return {
                body: apiKeys.map(ApiKey.fromDbApiKey)
            };
        });

    router.route("/v2/user/apiKeys")
        .method("POST")
        .handler(async evt => {
            const auth: giftbitRoutes.jwtauth.AuthorizationBadge = evt.meta["auth"];

            evt.validateBody({
                properties: {
                    displayName: {
                        type: "string",
                        minLength: 1
                    }
                }
            });

            const apiKey = await createApiKey(auth, evt.body.displayName);
            return {
                body: apiKey,
                statusCode: cassava.httpStatusCode.success.CREATED
            };
        });

    router.route("/v2/user/apiKeys/{id}")
        .method("GET")
        .handler(async evt => {
            const auth: giftbitRoutes.jwtauth.AuthorizationBadge = evt.meta["auth"];
            auth.requireIds("userId");

            const apiKey = await DbApiKey.getByAccount(auth.userId, evt.pathParameters.id);
            if (!apiKey) {
                throw new giftbitRoutes.GiftbitRestError(cassava.httpStatusCode.clientError.NOT_FOUND, `Could not find api key with id '${evt.pathParameters.id}'.`, "ApiKeyNotFound");
            }
            return {
                body: ApiKey.fromDbApiKey(apiKey)
            };
        });

    router.route("/v2/user/apiKeys/{id}")
        .method("DELETE")
        .handler(async evt => {
            const auth: giftbitRoutes.jwtauth.AuthorizationBadge = evt.meta["auth"];
            await deleteApiKey(auth, evt.pathParameters.id);
            return {
                body: {}
            };
        });
}

async function createApiKey(auth: giftbitRoutes.jwtauth.AuthorizationBadge, displayName: string): Promise<ApiKey> {
    auth.requireIds("userId", "teamMemberId");

    log.info("Creating API key for", auth.userId, auth.teamMemberId, "with name", displayName);

    const teamMember = await DbTeamMember.getByAuth(auth);
    const apiKey: DbApiKey = {
        userId: stripUserIdTestMode(auth.userId),
        teamMemberId: stripUserIdTestMode(auth.teamMemberId),
        displayName,
        tokenId: uuid().replace(/-/g, ""),
        tokenVersion: 3,
        roles: teamMember.roles,
        scopes: teamMember.scopes,
        dateCreated: dateCreatedNow()
    };
    await DbApiKey.put(apiKey);

    const badge = DbUserLogin.getBadge(teamMember, isTestModeUserId(auth.userId), false);
    badge.uniqueIdentifier = apiKey.tokenId;
    const apiToken = await DbUserLogin.getBadgeApiToken(badge);

    log.info("Created API key with tokenId", apiKey.tokenId);

    return ApiKey.createResponse(apiKey, apiToken);
}


async function deleteApiKey(auth: giftbitRoutes.jwtauth.AuthorizationBadge, tokenId: string): Promise<void> {
    auth.requireIds("userId");

    log.info("Deleting API key for", auth.userId, auth.teamMemberId, "with tokenId", tokenId);

    const apiKey = await DbApiKey.getByAccount(auth.userId, tokenId);
    if (!apiKey) {
        throw new giftbitRoutes.GiftbitRestError(cassava.httpStatusCode.clientError.NOT_FOUND, `Could not find api key with id '${tokenId}'.`, "ApiKeyNotFound");
    }

    await DbApiKey.del(apiKey);

    // TODO invalidate key in credentials service
}
