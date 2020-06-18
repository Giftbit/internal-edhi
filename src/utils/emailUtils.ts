import * as aws from "aws-sdk";
import dns = require("dns");
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

export async function isValidEmailAddress(emailAddress: string): Promise<boolean> {
    // Email regexes are famously more complicated than you'd think they should be.
    // see https://emailregex.com/
    if (!/^(([^<>()[\]\\.,;:\s@"]+(\.[^<>()[\]\\.,;:\s@"]+)*)|(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/.test(emailAddress)) {
        log.info("Email address", emailAddress, "is not valid by regex");
        return false;
    }

    const domain = emailAddress.split("@")[1];
    const mxRecords = await new Promise<dns.MxRecord[]>((resolve, reject) => {
        dns.resolveMx(domain, (err, res) => {
            if (err) {
                log.debug("Failed to resolve email address domain MX records", err);
                resolve([]);
            } else {
                log.debug("Found email address domain MX records", res);
                resolve(res.filter(rec => !!rec.exchange));
            }
        });
    });
    if (mxRecords.length === 0) {
        log.info("Email address", emailAddress, "domain has no MX records");
        return false;
    }

    // There are methods to attempt to verify that the inbox/user of the email
    // address exists, but they're flaky.  Some servers (Yahoo and iCloud are
    // known) shut down attempts to probe this (breaking the SMTP spec in the
    // process) as an anti-spam measure.  False negatives have a high cost for
    // us so we're not going to test that.

    return true;
}
