import * as uuid from "uuid/v4";
import {dynamodb, tokenActionDynameh} from "./dynamodb";

/**
 * Send a user an email with a token that lets them take an
 * anonymous action based on the token.
 */
export interface DbTokenAction {
    token: string;
    action: DbTokenAction.Action;
    email: string;
    userId?: string;
    teamMemberId?: string;
    ttl: Date | number;
}


export namespace DbTokenAction {
    export type Action = "emailVerification" | "resetPassword" | "acceptTeamInvite";

    export interface GenerateAdditionalParams {
        email: string;
        userId?: string;
        teamMemberId?: string;
    }

    export function generate(action: Action, durationInDays: number, params: GenerateAdditionalParams): DbTokenAction {
        const timeoutDate = new Date();
        timeoutDate.setDate(timeoutDate.getDate() + durationInDays);
        return {
            token: uuid().replace(/-/g, ""),
            action: action,
            ttl: timeoutDate,
            ...params
        };
    }

    export async function get(token: string): Promise<DbTokenAction> {
        const req = tokenActionDynameh.requestBuilder.buildGetInput(token);
        const resp = await dynamodb.getItem(req).promise();
        return tokenActionDynameh.responseUnwrapper.unwrapGetOutput(resp);
    }

    export async function put(tokenAction: DbTokenAction): Promise<void> {
        const req = tokenActionDynameh.requestBuilder.buildPutInput(tokenAction);
        await dynamodb.putItem(req).promise();
    }

    export async function del(tokenAction: DbTokenAction): Promise<void> {
        const req = tokenActionDynameh.requestBuilder.buildDeleteInput(tokenAction);
        await dynamodb.deleteItem(req).promise();
    }
}
