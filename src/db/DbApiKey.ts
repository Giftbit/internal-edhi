import * as aws from "aws-sdk";
import * as uuid from "uuid";
import {DbObject} from "./DbObject";
import {dynamodb, objectDynameh} from "./dynamodb";
import {isTestModeUserId} from "../utils/userUtils";
import * as giftbitRoutes from "giftbit-cassava-routes";
import {DbDeletedApiKey} from "./DbDeletedApiKey";

/**
 * ApiKeys are unusual in Edhi: there are separate live and test mode versions.
 * For test mode both the accountId and userId must be in test mode.
 */
export interface DbApiKey {

    accountId: string;
    userId: string;
    name: string;

    tokenId: string;
    tokenVersion: number;
    roles: string[];
    scopes: string[];
    createdDate: string;

}

export namespace DbApiKey {

    export function fromDbObject(o: DbObject): DbApiKey {
        if (!o) {
            return null;
        }
        const apiKey = {...o};
        delete apiKey.pk;
        delete apiKey.sk;
        delete apiKey.pk2;
        delete apiKey.sk2;
        return apiKey as any;
    }

    export function toDbObject(apiKey: DbApiKey): DbApiKey & DbObject {
        if (!apiKey) {
            return null;
        }
        return {
            ...apiKey,
            ...getKeys(apiKey)
        };
    }

    export function getKeys(apiKey: DbApiKey): DbObject {
        if (!apiKey || !apiKey.accountId || !apiKey.userId || !apiKey.tokenId) {
            throw new Error("Not a valid ApiKey.");
        }
        return {
            pk: "Account/" + apiKey.accountId,
            sk: "ApiKey/" + apiKey.tokenId
        };
    }

    export async function getByAccount(accountId: string, tokenId: string): Promise<DbApiKey> {
        return fromDbObject(await DbObject.get("Account/" + accountId, "ApiKey/" + tokenId));
    }

    export async function getByUser(userId: string, tokenId: string): Promise<DbApiKey> {
        return fromDbObject(await DbObject.getSecondary("User/" + userId, "ApiKey/" + tokenId));
    }

    export async function put(apiKey: DbApiKey): Promise<void> {
        if (isTestModeUserId(apiKey.accountId) !== isTestModeUserId(apiKey.userId)) {
            throw new Error(`accountId and userId must both be live or both be test mode accountId=${apiKey.accountId} userId=${apiKey.userId}`);
        }
        const req = buildPutInput(apiKey);
        await dynamodb.putItem(req).promise();
    }

    export function buildPutInput(apiKey: DbApiKey): aws.DynamoDB.PutItemInput {
        const req = objectDynameh.requestBuilder.buildPutInput(toDbObject(apiKey));
        objectDynameh.requestBuilder.addCondition(req, {
            attribute: "pk",
            operator: "attribute_not_exists"
        });
        return req;
    }

    export async function del(apiKey: DbApiKey): Promise<void> {
        const deleteReq = objectDynameh.requestBuilder.buildDeleteInput(getKeys(apiKey));

        // Store a copy of the deleted API key for future reference.
        const deletedObject = DbDeletedApiKey.toDbObject(DbDeletedApiKey.fromDbApiKey(apiKey));
        const putDeletedReq = objectDynameh.requestBuilder.buildPutInput(deletedObject);

        const req = objectDynameh.requestBuilder.buildTransactWriteItemsInput(deleteReq, putDeletedReq);
        await dynamodb.transactWriteItems(req).promise();
    }

    export async function getAllForAccount(accountId: string): Promise<DbApiKey[]> {
        const req = objectDynameh.requestBuilder.buildQueryInput("Account/" + accountId, "begins_with", "ApiKey/");
        const objects = await objectDynameh.queryHelper.queryAll(dynamodb, req);
        return objects.map(fromDbObject);
    }

    export async function getAllForAccountUser(accountId: string, userId: string): Promise<DbApiKey[]> {
        if (isTestModeUserId(accountId) !== isTestModeUserId(userId)) {
            throw new Error(`accountId and userId must both be live or both be test mode accountId=${accountId} userId=${userId}`);
        }

        const req = objectDynameh.requestBuilder.buildQueryInput("Account/" + accountId, "begins_with", "ApiKey/");
        objectDynameh.requestBuilder.addFilter(req, {
            attribute: "pk2",
            operator: "=",
            values: ["User/" + userId]
        });
        const objects = await objectDynameh.queryHelper.queryAll(dynamodb, req);
        return objects.map(fromDbObject);
    }

    export function getBadge(apiKey: DbApiKey, liveMode: boolean): giftbitRoutes.jwtauth.AuthorizationBadge {
        const auth = new giftbitRoutes.jwtauth.AuthorizationBadge();
        auth.userId = apiKey.accountId + (liveMode ? "" : "-TEST");
        auth.teamMemberId = apiKey.userId + (liveMode ? "" : "-TEST");
        auth.roles = apiKey.roles;
        auth.scopes = apiKey.scopes;
        auth.issuer = "EDHI";
        auth.audience = "API";
        auth.expirationTime = null;
        auth.issuedAtTime = new Date();
        auth.uniqueIdentifier = apiKey.tokenId;
        return auth;
    }

    export function generateTokenId(): string {
        return "tok-" + uuid.v4().replace(/-/g, "");
    }
}
