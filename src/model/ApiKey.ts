import {DbApiKey} from "../db/DbApiKey";

export interface ApiKey {

    userId: string;
    teamMemberId: string;
    displayName: string;

    tokenId: string;
    roles: string[];
    scopes: string[];
    dateCreated: string;

    // This is only set as a response when the token is first created.
    token?: string;

}

export namespace ApiKey {

    export function fromDbApiKey(apiKey: DbApiKey): ApiKey {
        return {
            userId: apiKey.userId,
            teamMemberId: apiKey.teamMemberId,
            displayName: apiKey.displayName,
            tokenId: apiKey.tokenId,
            roles: apiKey.roles,
            scopes: apiKey.scopes,
            dateCreated: apiKey.dateCreated
        };
    }

    export function createResponse(apiKey: DbApiKey, token: string): ApiKey {
        const res = fromDbApiKey(apiKey);
        res.token = token;
        return res;
    }
}
