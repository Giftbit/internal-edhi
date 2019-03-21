import * as aws from "aws-sdk";
import log = require("loglevel");

const ses = new aws.SES({
    apiVersion: "2010-12-01",
    credentials: new aws.EnvironmentCredentials("AWS"),
    region: process.env["AWS_REGION"]
});

const VALID_EMAIL_ADDRESS_REGEX = /^(([^<>()\[\]\\.,;:\s@"]+(\.[^<>()\[\]\\.,;:\s@"]+)*)|(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/;

export function isValidEmailAddress(email: string): boolean {
    return VALID_EMAIL_ADDRESS_REGEX.test(email);
}

export interface SendEmailParams {
    toAddress: string;
    subject: string;
    htmlBody?: string;
    textBody?: string;
    replyToAddress?: string;
}

export async function sendEmail(params: SendEmailParams): Promise<aws.SES.SendEmailResponse> {
    if (!params.htmlBody && !params.textBody) {
        throw new Error("At least one of htmlBody and textBody must be defined.");
    }

    const eParams: aws.SES.Types.SendEmailRequest = {
        Destination: {
            ToAddresses: [params.toAddress]
        },
        Message: {
            Body: {
                Html: params.htmlBody && {
                    Data: params.htmlBody
                } || undefined,
                Text: params.textBody && {
                    Data: params.textBody
                } || undefined
            },
            Subject: {
                Data: params.subject
            }
        },
        Source: `notifications@${process.env["LIGHTRAIL_EMAIL_DOMAIN"]}`
    };
    if (params.replyToAddress) {
        eParams.ReplyToAddresses = [params.replyToAddress];
    }

    log.info("Sending email:", eParams);
    return ses.sendEmail(eParams).promise();
}
