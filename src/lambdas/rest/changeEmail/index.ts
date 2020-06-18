import * as cassava from "cassava";
import * as giftbitRoutes from "giftbit-cassava-routes";
import {sendChangeEmailAddressEmail} from "./sendChangeEmailAddressEmail";
import {DbUser} from "../../../db/DbUser";
import {objectDynameh, transactWriteItemsFixed} from "../../../db/dynamodb";
import {sendEmailAddressChangedEmail} from "./sendEmailAddressChangedEmail";
import {DbAccountUser} from "../../../db/DbAccountUser";
import {stripUserIdTestMode} from "../../../utils/userUtils";
import {loginUserByEmailAction} from "../login";
import {isValidEmailAddress} from "../../../utils/emailUtils";
import {DbTokenAction} from "../../../db/DbTokenAction";
import log = require("loglevel");

export function installChangeEmailAuthedRest(router: cassava.Router): void {
    router.route("/v2/user/changeEmail")
        .method("POST")
        .handler(async evt => {
            const auth: giftbitRoutes.jwtauth.AuthorizationBadge = evt.meta["auth"];
            auth.requireScopes("lightrailV2:user:update");
            auth.requireIds("teamMemberId");

            evt.validateBody({
                type: "object",
                properties: {
                    email: {
                        type: "string",
                        format: "email"
                    }
                },
                required: ["email"],
                additionalProperties: false
            });

            await initiateChangeEmailAddress(auth, evt.body.email);
            return {
                body: {
                    // This is really lazy but it's not worth the time to soften this rough edge right now.
                    message: "If this email address is not already in use an email will be sent to confirm the new address."
                }
            };
        });
}

async function initiateChangeEmailAddress(auth: giftbitRoutes.jwtauth.AuthorizationBadge, email: string): Promise<void> {
    auth.requireIds("teamMemberId");

    if (!await isValidEmailAddress(email)) {
        throw new giftbitRoutes.GiftbitRestError(cassava.httpStatusCode.clientError.UNPROCESSABLE_ENTITY, "Email address is not valid.");
    }

    if (await await DbUser.get(email)) {
        // Don't initiate the process but don't acknowledge it either.
        // We don't want to expose an attack on determining who has an account.
    } else {
        await sendChangeEmailAddressEmail(stripUserIdTestMode(auth.teamMemberId), email);
    }
}

export function installChangeEmailUnauthedRest(router: cassava.Router): void {
    router.route("/v2/user/changeEmail/complete")
        .method("GET")
        .handler(async evt => {
            return await completeChangeEmail(evt.queryStringParameters.token);
        });
}

export async function completeChangeEmail(token: string): Promise<cassava.RouterResponse> {
    const tokenAction = await DbTokenAction.get(token);
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
    const putNewUserReq = DbUser.buildPutInput(newUser);

    // Can't update the keys on an item in DynamoDB.  Gotta delete the old and make a new.
    const deleteOldUserReq = DbUser.buildDeleteInput(user);

    const accountUsers = await DbAccountUser.getAllForUser(tokenAction.userId);
    const updateAccountUsersReqs = accountUsers.map(accountUser => DbAccountUser.buildUpdateInput(accountUser, {
        attribute: "userDisplayName",
        action: "put",
        value: tokenAction.email
    }));
    if (updateAccountUsersReqs.length > 23) {
        // The maximum number of items in a transaction is 25.  Minus the 2 items above is 23.
        // see https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/Limits.html#limits-dynamodb-transactions
        log.error("Unable to change email address for user because they have a crazy huge number of AccountUsers. userId=", user.userId, "existing email=", user.email, "\nDbAccountUsers=", JSON.stringify(accountUsers, null, 2));
        giftbitRoutes.sentry.sendErrorNotification(new Error(`Unable to change email address for user because they have a crazy huge number of AccountUsers. userId=${user.userId} existing email=${user.email}`));
        throw new giftbitRoutes.GiftbitRestError(cassava.httpStatusCode.clientError.CONFLICT, "Unable to change email address.  Contact support for more info.");
    }

    try {
        const txReq = objectDynameh.requestBuilder.buildTransactWriteItemsInput(putNewUserReq, deleteOldUserReq, ...updateAccountUsersReqs);
        await transactWriteItemsFixed(txReq);
    } catch (error) {
        if (error.code === "TransactionCanceledException"
            && error.CancellationReasons
            && error.CancellationReasons.length >= 1
            && error.CancellationReasons[0].Code === "ConditionalCheckFailed"
        ) {
            // This can only happen if there email address wasn't taken before the confirmation
            // email was sent out, making this an edge case.
            throw new giftbitRoutes.GiftbitRestError(cassava.httpStatusCode.clientError.CONFLICT, "The email address is already in use in the Lightrail system.");
        }
        throw error;
    }

    log.info("Changed (authoritative data) email address for", tokenAction.userId, "to", tokenAction.email);

    await sendEmailAddressChangedEmail(user.email);
    await DbTokenAction.del(tokenAction);

    return loginUserByEmailAction(newUser, {location: "/app/#/changeEmailComplete"});
}
