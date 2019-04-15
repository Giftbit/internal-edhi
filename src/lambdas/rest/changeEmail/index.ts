import * as cassava from "cassava";
import * as giftbitRoutes from "giftbit-cassava-routes";
import {DbTeamMember} from "../../../db/DbTeamMember";
import {sendChangeEmailAddressEmail} from "./sendChangeEmailAddressEmail";
import {TokenAction} from "../../../db/TokenAction";
import {DbUserDetails} from "../../../db/DbUserDetails";
import {DbUserLogin} from "../../../db/DbUserLogin";
import {objectDynameh, transactWriteItemsFixed} from "../../../db/dynamodb";
import {sendEmailAddressChangedEmail} from "./sendEmailAddressChangedEmail";
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

            const existingLogin = await DbUserLogin.get(evt.body.email);
            if (!existingLogin) {
                // Don't initiate the process if the email address is already in use
                // but don't acknowledge it either.  We don't want to expose an attack
                // on determining who has an account.
                await sendChangeEmailAddressEmail(auth.teamMemberId, evt.body.email);
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

    log.info("Changing email address for", tokenAction.teamMemberId, "to", tokenAction.email);

    const userDetails = await DbUserDetails.get(tokenAction.teamMemberId);
    if (!userDetails) {
        throw new Error(`Could not find UserDetails for '${tokenAction.teamMemberId}'.`);
    }

    const userLogin = await DbUserLogin.get(userDetails.email);
    if (!userLogin) {
        throw new Error(`Could not find UserLogin for '${userDetails.email}'.  Did find UserDetails for '${tokenAction.teamMemberId}' so the DB is inconsistent.`);
    }

    const updateUserDetailsReq = objectDynameh.requestBuilder.buildUpdateInputFromActions(DbUserDetails.getKeys(userDetails), {
        attribute: "email",
        action: "put",
        value: tokenAction.email
    });
    objectDynameh.requestBuilder.addCondition(updateUserDetailsReq, {
        attribute: "pk",
        operator: "attribute_exists"
    });

    const deleteOldUserLoginReq = objectDynameh.requestBuilder.buildDeleteInput(DbUserLogin.getKeys(userLogin));
    objectDynameh.requestBuilder.addCondition(deleteOldUserLoginReq, {
        attribute: "pk",
        operator: "attribute_exists"
    });

    const newUserLogin: DbUserLogin = {
        ...userLogin,
        email: tokenAction.email
    };
    const putNewUserLoginReq = objectDynameh.requestBuilder.buildPutInput(DbUserLogin.toDbObject(newUserLogin));
    objectDynameh.requestBuilder.addCondition(putNewUserLoginReq, {
        attribute: "pk",
        operator: "attribute_not_exists"
    });

    try {
        const txReq = objectDynameh.requestBuilder.buildTransactWriteItemsInput(updateUserDetailsReq, deleteOldUserLoginReq, putNewUserLoginReq);
        await transactWriteItemsFixed(txReq);
    } catch (error) {
        if (error.code === "TransactionCanceledException"
            && error.CancellationReasons
            && error.CancellationReasons.length === 3
            && error.CancellationReasons[2].Code === "ConditionalCheckFailed"
        ) {
            // This can only happen if there email address wasn't taken before the confirmation
            // email was sent out, making this an edge case.
            throw new giftbitRoutes.GiftbitRestError(cassava.httpStatusCode.clientError.CONFLICT, "The email address is already in use in the Lightrail system.");
        }
        throw error;
    }

    log.info("Changed (authoritative data) email address for", tokenAction.teamMemberId, "to", tokenAction.email);

    // At this point there's no going back.  If we die here some data in the DB will be inconsistent.
    // Such is life in a de-normalized DB.  The good news is nothing below is considered authoritative.

    await sendEmailAddressChangedEmail(userLogin.email);
    await TokenAction.del(tokenAction);

    const teamMemberships = await DbTeamMember.getUserTeamMemberships(tokenAction.teamMemberId);
    for (const teamMember of teamMemberships) {
        try {
            await DbTeamMember.update(teamMember, {
                attribute: "userDisplayName",
                action: "put",
                value: tokenAction.email
            });
        } catch (error) {
            log.error("Unable to change displayName for team member", teamMember.userId, teamMember.teamMemberId, "\n", error);
        }
    }
}
