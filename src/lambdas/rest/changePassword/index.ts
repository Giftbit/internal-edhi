import * as cassava from "cassava";
import * as dynameh from "dynameh";
import * as giftbitRoutes from "giftbit-cassava-routes";
import {hashPassword, validatePassword} from "../../../utils/passwordUtils";
import {DbUserLogin} from "../../../db/DbUserLogin";
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
    const userLogin = await DbUserLogin.getByAuth(params.auth);
    if (!userLogin) {
        throw new Error("Could not find UserLogin for valid auth.");
    }

    if (!await validatePassword(params.oldPlaintextPassword, userLogin.password)) {
        log.warn("Can't change user password for", userLogin.email, "old password did not validate");
        throw new giftbitRoutes.GiftbitRestError(cassava.httpStatusCode.clientError.CONFLICT, "The old password is incorrect.", "IncorrectPassword");
    }

    const requirePasswordHistory = await userRequiresPasswordHistory(userLogin);
    if (requirePasswordHistory && await passwordIsInHistory(params.newPlaintextPassword, userLogin)) {
        log.warn("Can't change user password for", userLogin.email, "the new password is in the history");
        throw new giftbitRoutes.GiftbitRestError(cassava.httpStatusCode.clientError.CONFLICT, "The new password is being reused.", "ReusedPassword");
    }

    const userPassword: DbUserLogin.Password = await hashPassword(params.newPlaintextPassword);
    const userLoginUpdates: dynameh.UpdateExpressionAction[] = [
        {
            action: "put",
            attribute: "password",
            value: userPassword
        }
    ];

    if (requirePasswordHistory) {
        if (userLogin.passwordHistory) {
            userLoginUpdates.push({
                action: "put",
                attribute: `passwordHistory.${getHistoricalPasswordKey(userLogin.password)}`,
                value: userLogin.password
            });

            const passwordHistoryValues = Object.values(userLogin.passwordHistory);
            if (passwordHistoryValues.length > DbUserLogin.maxPasswordHistoryLength - 1) {
                userLoginUpdates.push({
                    action: "remove",
                    attribute: `passwordHistory.${getOldestHistoricalPasswordKey(passwordHistoryValues)}`
                });
            }
        } else {
            userLoginUpdates.push({
                action: "put",
                attribute: "passwordHistory",
                value: {
                    [getHistoricalPasswordKey(userLogin.password)]: userLogin.password
                }
            });
        }
    } else if (userLogin.passwordHistory) {
        userLoginUpdates.push({
            action: "put",
            attribute: "passwordHistory",
            value: null
        });
    }

    await DbUserLogin.update(userLogin, ...userLoginUpdates);
    log.info("User", userLogin.email, "has changed their password");
}

async function userRequiresPasswordHistory(userLogin: DbUserLogin): Promise<boolean> {
    const accountUsers = await DbAccountUser.getAllForUser(userLogin.userId);
    const accounts = await DbAccount.getMany(accountUsers.map(accountUser => accountUser.accountId));
    return !!accounts.find(account => account.requirePasswordHistory);
}

async function passwordIsInHistory(plaintextPassword: string, userLogin: DbUserLogin): Promise<boolean> {
    if (await validatePassword(plaintextPassword, userLogin.password)) {
        return true;
    }
    if (!userLogin.passwordHistory) {
        return false;
    }
    for (const historicalPassword of Object.values(userLogin.passwordHistory)) {
        if (await validatePassword(plaintextPassword, historicalPassword)) {
            return true;
        }
    }
    return false;
}

function getHistoricalPasswordKey(historicalPassword: DbUserLogin.Password): string {
    return historicalPassword.createdDate.replace(/\./g, "");
}

function getOldestHistoricalPasswordKey(passwordHistory: DbUserLogin.Password[]): string {
    const oldestHistoricalPassword = passwordHistory.reduce((previousValue, currentValue) => previousValue == null || previousValue.createdDate < currentValue.createdDate ? previousValue : currentValue);
    return getHistoricalPasswordKey(oldestHistoricalPassword);
}
