import * as aws from "aws-sdk";
import * as cassava from "cassava";
import * as dynameh from "dynameh";
import * as giftbitRoutes from "giftbit-cassava-routes";
import {hashPassword, validatePassword} from "../../../utils/passwordUtils";
import {DbUser} from "../../../db/DbUser";
import {DbUserPasswordHistory} from "../../../db/DbUserPasswordHistory";
import {dynamodb, objectDynameh} from "../../../db/dynamodb";
import log = require("loglevel");

export function installChangePasswordRest(router: cassava.Router): void {
    router.route("/v2/user/changePassword")
        .method("POST")
        .handler(async evt => {
            const auth: giftbitRoutes.jwtauth.AuthorizationBadge = evt.meta["auth"];
            auth.requireScopes("lightrailV2:user:update");
            auth.requireIds("teamMemberId");

            evt.validateBody({
                properties: {
                    oldPassword: {
                        type: "string"
                    },
                    newPassword: {
                        type: "string",
                        minLength: 8,
                        maxLength: 255
                    }
                },
                required: ["oldPassword", "newPassword"],
                additionalProperties: false
            });

            await changePassword({
                auth,
                oldPlaintextPassword: evt.body.oldPassword,
                newPlaintextPassword: evt.body.newPassword
            });

            return {
                body: {},
                statusCode: cassava.httpStatusCode.success.OK
            };
        });
}

async function changePassword(params: { auth: giftbitRoutes.jwtauth.AuthorizationBadge, oldPlaintextPassword: string, newPlaintextPassword: string }): Promise<void> {
    const user = await DbUser.getByAuth(params.auth);
    if (!user) {
        throw new Error("Could not find User for valid auth.");
    }

    if (!await validatePassword(params.oldPlaintextPassword, user.login.password)) {
        log.warn("Can't change user password for", user.email, "old password did not validate");
        throw new giftbitRoutes.GiftbitRestError(cassava.httpStatusCode.clientError.CONFLICT, "The old password is incorrect.", "IncorrectPassword");
    }

    return await completeChangePassword(params.newPlaintextPassword, user);
}

export async function completeChangePassword(newPlaintextPassword: string, user: DbUser, ...additionalUserUpdates: dynameh.UpdateExpressionAction[]): Promise<void> {
    const userPasswordHistory = await DbUserPasswordHistory.get(user.userId);
    if (await passwordIsInHistory(newPlaintextPassword, user, userPasswordHistory)) {
        log.warn("Can't change user password for", user.email, "the new password is in the history");
        throw new giftbitRoutes.GiftbitRestError(cassava.httpStatusCode.clientError.CONFLICT, "The new password is being reused.", "ReusedPassword");
    }

    const userNewPassword: DbUser.Password = await hashPassword(newPlaintextPassword);
    const userUpdateReq = DbUser.buildUpdateInput(
        user,
        {
            action: "put",
            attribute: "login.password",
            value: userNewPassword
        },
        ...additionalUserUpdates
    );
    const userPasswordHistoryReq = getUpdatePasswordHistoryInput(user, userPasswordHistory);
    const tx = objectDynameh.requestBuilder.buildTransactWriteItemsInput(...[userUpdateReq, userPasswordHistoryReq].filter(i => !!i));
    await dynamodb.transactWriteItems(tx).promise();

    log.info("User", user.email, "has changed their password");
}

function getUpdatePasswordHistoryInput(user: DbUser, userPasswordHistory: DbUserPasswordHistory | null): aws.DynamoDB.PutItemInput | aws.DynamoDB.UpdateItemInput {
    if (!user.login.password) {
        return null;
    } else if (userPasswordHistory) {
        const updates: dynameh.UpdateExpressionAction[] = [
            {
                action: "put",
                attribute: `passwordHistory.${getHistoricalPasswordKey(user.login.password)}`,
                value: user.login.password
            }
        ];
        while (Object.values(userPasswordHistory.passwordHistory).length > DbUserPasswordHistory.maxPasswordHistoryLength - 1) {
            const keyToRemove = getOldestHistoricalPasswordKey(userPasswordHistory.passwordHistory);
            delete userPasswordHistory.passwordHistory[keyToRemove];
            updates.push({
                action: "remove",
                attribute: `passwordHistory.${keyToRemove}`
            });
        }
        return DbUserPasswordHistory.buildUpdateInput(userPasswordHistory, ...updates);
    } else {
        const newUserPasswordHistory: DbUserPasswordHistory = {
            userId: user.userId,
            passwordHistory: {
                [getHistoricalPasswordKey(user.login.password)]: user.login.password
            }
        };
        return DbUserPasswordHistory.buildPutInput(newUserPasswordHistory);
    }
}

async function passwordIsInHistory(plaintextPassword: string, user: DbUser, userPasswordHistory: DbUserPasswordHistory | null): Promise<boolean> {
    if (await validatePassword(plaintextPassword, user.login.password)) {
        return true;
    }
    if (userPasswordHistory) {
        for (const historicalPassword of Object.values(userPasswordHistory.passwordHistory)) {
            if (await validatePassword(plaintextPassword, historicalPassword)) {
                return true;
            }
        }
    }
    return false;
}

function getHistoricalPasswordKey(historicalPassword: DbUser.Password): string {
    return historicalPassword.createdDate.replace(/[-:.TZ]/g, "");
}

function getOldestHistoricalPasswordKey(passwordHistory: { [key: string]: DbUser.Password }): string {
    return Object.keys(passwordHistory)
        .reduce((prevKey, curKey) => prevKey == null || passwordHistory[prevKey].createdDate < passwordHistory[curKey].createdDate ? prevKey : curKey);
}
