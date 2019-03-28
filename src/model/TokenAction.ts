import * as uuid from "uuid/v4";

/**
 * Send a user an email with a token that lets them take an
 * anonymous action based on the token.
 */
export interface TokenAction {
    token: string;
    action: TokenAction.Action;
    email: string;
    userId?: string;
    teamMemberId?: string;
    ttl: Date | number;
}


export namespace TokenAction {
    export type Action = "emailVerification" | "resetPassword" | "acceptTeamInvite";

    export interface GenerateAdditionalParams {
        email: string;
        userId?: string;
        teamMemberId?: string;
    }

    export function generate(action: Action, durationInDays: number, params: GenerateAdditionalParams): TokenAction {
        const timeoutDate = new Date();
        timeoutDate.setDate(timeoutDate.getDate() + durationInDays);
        return {
            token: uuid().replace(/-/g, ""),
            action: action,
            ttl: timeoutDate,
            ...params
        };
    }
}
