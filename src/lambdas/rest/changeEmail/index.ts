import * as cassava from "cassava";
import * as giftbitRoutes from "giftbit-cassava-routes";
import {sendChangeEmailAddressEmail} from "./sendChangeEmailAddressEmail";
import {TokenAction} from "../../../db/TokenAction";
import {DbUser} from "../../../db/DbUser";
import {objectDynameh, transactWriteItemsFixed} from "../../../db/dynamodb";
import {sendEmailAddressChangedEmail} from "./sendEmailAddressChangedEmail";
import {DbAccountUser} from "../../../db/DbAccountUser";
import {stripUserIdTestMode} from "../../../utils/userUtils";
import log = require("loglevel");

export function installChangeEmailAuthedRest(router: cassava.Router): void {
    router.route("/v2/user/changeEmail")
        .method("POST")
        .handler(async evt => {
            const auth: giftbitRoutes.jwtauth.AuthorizationBadge = evt.meta["auth"];
            auth.requireScopes("lightrailV2:user:update");
            auth.requireIds("teamMemberId");

            evt.validateBody({
                properties: {
                    email: {
                        type: "string",
                        format: "email"
                    }
                },
                required: ["email"],
                additionalProperties: false
            });

            const existingUser = await DbUser.get(evt.body.email);
            if (!existingUser) {
                // Don't initiate the process if the email address is already in use
                // but don't acknowledge it either.  We don't want to expose an attack
                // on determining who has an account.
                await sendChangeEmailAddressEmail(stripUserIdTestMode(auth.teamMemberId), evt.body.email);
            }

            return {
                body: {
                    // This is really lazy but it's not worth the time to soften his rough edge right now.
                    message: "If this email address is not already in use an email will be sent to confirm the new address."
                }
            };
        });
}

export function installChangeEmailUnauthedRest(router: cassava.Router): void {
    router.route("/v2/user/changeEmail/complete")
        .method("GET")
        .handler(async evt => {
            await completeChangeEmail(evt.queryStringParameters.token);

            return {
                body: {
                    // This is really lazy but it's not worth the time to soften his rough edge right now.
                    message: "You have successfully changed your email address.  Please log in to continue."
                }
            };
        });
}

export async function completeChangeEmail(token: string): Promise<void> {
    const tokenAction = await TokenAction.get(token);
    if (!tokenAction || tokenAction.action !== "changeEmail") {
        log.warn("Could not find changeEmail TokenAction for token", token);
        throw new giftbitRoutes.GiftbitRestError(cassava.httpStatusCode.clientError.CONFLICT, "There was an error confirming the change of email address.  Maybe the email link timed out.");
    }

    log.info("Changing email address for", tokenAction.userId, "to", tokenAction.email);

    const user = await DbUser.getById(tokenAction.userId);
    if (!user) {
        throw new Error(`Could not find User with id '${tokenAction.userId}'.`);
    }

    const newUser: DbUser = {
        ...user,
        email: tokenAction.email
    };
    const putNewUserReq = objectDynameh.requestBuilder.buildPutInput(DbUser.toDbObject(newUser));
    objectDynameh.requestBuilder.addCondition(putNewUserReq, {
        attribute: "pk",
        operator: "attribute_not_exists"
    });

    // Can't update the keys on an item in DynamoDB.  Gotta delete the old and make a new.
    const deleteOldUserReq = objectDynameh.requestBuilder.buildDeleteInput(DbUser.getKeys(user));
    objectDynameh.requestBuilder.addCondition(deleteOldUserReq, {
        attribute: "pk",
        operator: "attribute_exists"
    });

    try {
        const txReq = objectDynameh.requestBuilder.buildTransactWriteItemsInput(putNewUserReq, deleteOldUserReq);
        await transactWriteItemsFixed(txReq);
    } catch (error) {
        if (error.code === "TransactionCanceledException"
            && error.CancellationReasons
            && error.CancellationReasons.length === 2
            && error.CancellationReasons[0].Code === "ConditionalCheckFailed"
        ) {
            // This can only happen if there email address wasn't taken before the confirmation
            // email was sent out, making this an edge case.
            throw new giftbitRoutes.GiftbitRestError(cassava.httpStatusCode.clientError.CONFLICT, "The email address is already in use in the Lightrail system.");
        }
        throw error;
    }

    log.info("Changed (authoritative data) email address for", tokenAction.userId, "to", tokenAction.email);

    // At this point there's no going back.  If we die here some data in the DB will be inconsistent.
    // Such is life in a de-normalized DB.  The good news is nothing below is considered authoritative.

    await sendEmailAddressChangedEmail(user.email);
    await TokenAction.del(tokenAction);

    const accountUsers = await DbAccountUser.getAllForUser(tokenAction.userId);
    for (const accountUser of accountUsers) {
        try {
            await DbAccountUser.update(accountUser, {
                attribute: "userDisplayName",
                action: "put",
                value: tokenAction.email
            });
        } catch (error) {
            log.error("Unable to change displayName for AccountUser", accountUser.accountId, accountUser.userId, "\n", error);
        }
    }
}
