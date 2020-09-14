import * as cassava from "cassava";
import * as giftbitRoutes from "giftbit-cassava-routes";
import {sendEmail} from "../../../utils/emailUtils";
import {DbAccount} from "../../../db/DbAccount";
import {DbUser} from "../../../db/DbUser";
import {DbIpAction} from "../../../db/DbIpAction";
import log = require("loglevel");

export function installCustomerSupportRest(router: cassava.Router): void {
    router.route("/v2/user/contactCustomerSupport")
        .method("POST")
        .handler(async evt => {
            const auth: giftbitRoutes.jwtauth.AuthorizationBadge = evt.meta["auth"];

            evt.validateBody({
                type: "object",
                properties: {
                    customerSupportEmail: {
                        type: "string",
                        format: "email",
                        minLength: 1,
                        maxLength: 320
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

            await sendCustomerSupportEmail(auth, {
                recipient: evt.body.customerSupportEmail,
                subject: evt.body.subject,
                message: evt.body.message,
                ip: evt.headersLowerCase["x-forwarded-for"].split(",")[0]
            });
            return {
                body: {},
                statusCode: cassava.httpStatusCode.success.OK
            };
        });
}

interface SendCustomerSupportEmailParams {
    recipient: string;
    subject: string;
    message: string;
    ip: string;
}

async function sendCustomerSupportEmail(auth: giftbitRoutes.jwtauth.AuthorizationBadge, params: SendCustomerSupportEmailParams): Promise<void> {
    if (!isCustomerSupportEmailAddress(params.recipient)) {
        throw new giftbitRoutes.GiftbitRestError(cassava.httpStatusCode.clientError.UNPROCESSABLE_ENTITY, `The received customer support email '${params.recipient}' does not belong to the known customer support email addresses.`, "InvalidCustomerSupportEmail");
    }

    if (!await DbIpAction.canTakeAction("contactCustomerSupport", params.ip)) {
        throw new giftbitRoutes.GiftbitRestError(cassava.httpStatusCode.clientError.TOO_MANY_REQUESTS, "A large number of requests to reset password has been detected.  Please wait 24 hours.");
    }

    const user = await DbUser.getByAuth(auth);
    const account = auth.userId && await DbAccount.getByAuth(auth);

    // This email is intentionally sent as text and not HTML out of paranoia
    // about some kind of HTML-based spoofing shenanigans.
    log.info("Sending internal customer support email to", params.recipient);
    await sendEmail({
        toAddress: params.recipient,
        subject: `A Lightrail user requested customer support: ${params.subject}`,
        textBody: `This email is from Lightrail's contact customer support endpoint.\n\n`
            + `Account ID: ${auth.userId}\n`
            + `Account name: ${account && account.name}\n`
            + `User ID: ${auth.teamMemberId}\n`
            + `User email: ${user.email}\n`
            + `Message: ${params.message}`
    });
}

function isCustomerSupportEmailAddress(recipient: string): boolean {
    return recipient.endsWith("@giftbit.com") || recipient.endsWith("@lightrail.com");
}
