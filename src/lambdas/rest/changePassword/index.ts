import * as cassava from "cassava";
import * as dynameh from "dynameh";
import * as giftbitRoutes from "giftbit-cassava-routes";
import {hashPassword, validatePassword} from "../../../utils/passwordUtils";
import {DbUser} from "../../../db/DbUser";
import {DbAccount} from "../../../db/DbAccount";
import {DbAccountUser} from "../../../db/DbAccountUser";
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

    const requirePasswordHistory = await userRequiresPasswordHistory(user);
    if (requirePasswordHistory && await passwordIsInHistory(params.newPlaintextPassword, user)) {
        log.warn("Can't change user password for", user.email, "the new password is in the history");
        throw new giftbitRoutes.GiftbitRestError(cassava.httpStatusCode.clientError.CONFLICT, "The new password is being reused.", "ReusedPassword");
    }

    const userPassword: DbUser.Password = await hashPassword(params.newPlaintextPassword);
    const userUpdates: dynameh.UpdateExpressionAction[] = [
        {
            action: "put",
            attribute: "login.password",
            value: userPassword
        }
    ];

    if (requirePasswordHistory) {
        if (user.login.passwordHistory) {
            userUpdates.push({
                action: "put",
                attribute: `login.passwordHistory.${getHistoricalPasswordKey(user.login.password)}`,
                value: user.login.password
            });

            const passwordHistoryValues = Object.values(user.login.passwordHistory);
            if (passwordHistoryValues.length > DbUser.maxPasswordHistoryLength - 1) {
                userUpdates.push({
                    action: "remove",
                    attribute: `login.passwordHistory.${getOldestHistoricalPasswordKey(passwordHistoryValues)}`
                });
            }
        } else {
            userUpdates.push({
                action: "put",
                attribute: "login.passwordHistory",
                value: {
                    [getHistoricalPasswordKey(user.login.password)]: user.login.password
                }
            });
        }
    } else if (user.login.passwordHistory) {
        userUpdates.push({
            action: "put",
            attribute: "login.passwordHistory",
            value: null
        });
    }

    await DbUser.update(user, ...userUpdates);
    log.info("User", user.email, "has changed their password");
}

async function userRequiresPasswordHistory(user: DbUser): Promise<boolean> {
    const accountUsers = await DbAccountUser.getAllForUser(user.userId);
    const accounts = await DbAccount.getMany(accountUsers.map(accountUser => accountUser.accountId));
    return !!accounts.find(account => account.preventPasswordReuse);
}

async function passwordIsInHistory(plaintextPassword: string, user: DbUser): Promise<boolean> {
    if (await validatePassword(plaintextPassword, user.login.password)) {
        return true;
    }
    if (!user.login.passwordHistory) {
        return false;
    }
    for (const historicalPassword of Object.values(user.login.passwordHistory)) {
        if (await validatePassword(plaintextPassword, historicalPassword)) {
            return true;
        }
    }
    return false;
}

function getHistoricalPasswordKey(historicalPassword: DbUser.Password): string {
    return historicalPassword.createdDate.replace(/\./g, "");
}

function getOldestHistoricalPasswordKey(passwordHistory: DbUser.Password[]): string {
    const oldestHistoricalPassword = passwordHistory.reduce((previousValue, currentValue) => previousValue == null || previousValue.createdDate < currentValue.createdDate ? previousValue : currentValue);
    return getHistoricalPasswordKey(oldestHistoricalPassword);
}
