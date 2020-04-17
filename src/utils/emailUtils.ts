import * as aws from "aws-sdk";
import log = require("loglevel");

const ses = new aws.SES({
    apiVersion: "2010-12-01",
    credentials: new aws.EnvironmentCredentials("AWS"),
    region: process.env["AWS_REGION"]
});

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
            Body: {},
            Subject: {
                Data: params.subject
            }
        },
        Source: `notifications@${process.env["LIGHTRAIL_EMAIL_DOMAIN"]}`
    };
    if (params.htmlBody) {
        eParams.Message.Body.Html = {Data: params.htmlBody};
    }
    if (params.textBody) {
        eParams.Message.Body.Text = {Data: params.textBody};
    }
    if (params.replyToAddress) {
        eParams.ReplyToAddresses = [params.replyToAddress];
    }

    log.info("Sending email:", eParams);
    return ses.sendEmail(eParams).promise();
}
