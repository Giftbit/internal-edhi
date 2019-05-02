import * as cassava from "cassava";
import * as giftbitRoutes from "giftbit-cassava-routes";
import {sendEmail} from "../../../utils/emailUtils";
import {DbUserDetails} from "../../../db/DbUserDetails";
import {DbAccountDetails} from "../../../db/DbAccountDetails";
import log = require("loglevel");

export function installCustomerSupportRest(router: cassava.Router): void {
    router.route("/v2/user/contactCustomerSupport")
        .method("POST")
        .handler(async evt => {
            const auth: giftbitRoutes.jwtauth.AuthorizationBadge = evt.meta["auth"];

            evt.validateBody({
                properties: {
                    customerSupportEmail: {
                        type: "string",
                        format: "email",
                        minLength: 1
                    },
                    subject: {
                        type: "string",
                        minLength: 1,
                        maxLength: 1024
                    },
                    message: {
                        type: "string",
                        minLength: 1,
                        maxLength: 32768
                    }
                },
                required: ["customerSupportEmail", "subject", "message"],
                additionalProperties: false
            });

            await sendCustomerSupportEmail(auth, evt.body.customerSupportEmail, evt.body.subject, evt.body.message);
            return {
                body: {},
                statusCode: cassava.httpStatusCode.success.OK
            };
        });
}

async function sendCustomerSupportEmail(auth: giftbitRoutes.jwtauth.AuthorizationBadge, recipient: string, subject: string, message: string): Promise<void> {
    if (!isCustomerSupportEmailAddress(recipient)) {
        throw new giftbitRoutes.GiftbitRestError(cassava.httpStatusCode.clientError.UNPROCESSABLE_ENTITY, `The received customer support email '${recipient}' does not belong to the known customer support email addresses.`, "InvalidCustomerSupportEmail");
    }

    const userDetails = await DbUserDetails.getByAuth(auth);
    const accountDetails = auth.userId && await DbAccountDetails.getByAuth(auth);

    // This email is intentionally sent as text and not HTML out of paranoia
    // about some kind of HTML-based spoofing shenanigans.
    log.info("Sending internal customer support email to", recipient);
    await sendEmail({
        toAddress: recipient,
        subject: `A Lightrail user requested customer support: ${subject}`,
        textBody: `This email is from Lightrail's contact customer support endpoint.\n\n`
            + `Account ID: ${auth.userId}\n`
            + `Account name: ${accountDetails && accountDetails.name}\n`
            + `User ID: ${auth.teamMemberId}\n`
            + `User email: ${userDetails.email}\n`
            + `Message: ${message}`
    });
}

function isCustomerSupportEmailAddress(recipient: string): boolean {
    return recipient.endsWith("@giftbit.com") || recipient.endsWith("@lightrail.com");
}
