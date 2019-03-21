import {User} from "../../../model/User";
import {dateCreatedNow, dynamodb, userDynameh} from "../../../dynamodb";
import {sendEmail} from "../../../utils/emailUtils";
import log = require("loglevel");

const maxFailedLoginAttempts = 10;
const failedLoginTimoutMinutes = 60;

export async function addFailedLoginAttempt(user: User, sourceIp: string): Promise<void> {
    const failedAttempt = `${dateCreatedNow()}, ${sourceIp}`;
    if (!user.failedLoginAttempts) {
        user.failedLoginAttempts = new Set();
    }
    user.failedLoginAttempts.add(failedAttempt);

    if (user.failedLoginAttempts.size < maxFailedLoginAttempts) {
        log.info("Storing failed login attempt for user", user.email, "failedLoginAttempts.size=", user.failedLoginAttempts.size);

        const req = userDynameh.requestBuilder.buildUpdateInputFromActions(user, {
            action: "set_add",
            attribute: "failedLoginAttempts",
            values: new Set([failedAttempt])
        });
        await dynamodb.updateItem(req).promise();
    } else {
        log.info("Too many failed login attempts for user", user.email);

        const lockedUntilDate = new Date();
        lockedUntilDate.setMinutes(lockedUntilDate.getMinutes() + failedLoginTimoutMinutes);
        const req = userDynameh.requestBuilder.buildUpdateInputFromActions(
            user,
            {
                action: "remove",
                attribute: "failedLoginAttempts"
            },
            {
                action: "put",
                attribute: "lockedUntilDate",
                value: lockedUntilDate.toISOString()
            }
        );
        await dynamodb.updateItem(req).promise();
        await sendFailedLoginTimeoutEmail(user);
    }
}

export async function clearFailedLoginAttempts(user: User): Promise<void> {
    if ((user.failedLoginAttempts && user.failedLoginAttempts.size > 0) || user.lockedUntilDate) {
        const req = userDynameh.requestBuilder.buildUpdateInputFromActions(
            user,
            {
                action: "remove",
                attribute: "failedLoginAttempts"
            },
            {
                action: "remove",
                attribute: "lockedUntilDate"
            }
        );
        await dynamodb.updateItem(req).promise();
    }
}

const failedLoginTimeoutEmailTemplate = "Hello,\n\nWe have detected {{failedLoginCount}} consecutive failed login attempts on your Lightrail account.  Your account has been locked for {{failedLoginTimoutMinutes}} minutes for your protection.  You will not be able to login until that time has expired.  If you have any questions please contact us at hello@lightrail.com .\n\nFailed login dates and IP addresses:\n{{failedLoginAttempts}}";

async function sendFailedLoginTimeoutEmail(user: User): Promise<void> {
    log.info("Sending failed login timeout email to", user.email);

    const failedLoginAttempts = Array.from(user.failedLoginAttempts)
        .sort()
        .join("\n");

    const body = failedLoginTimeoutEmailTemplate
        .replace(/{{failedLoginCount}}/g, user.failedLoginAttempts.size.toString())
        .replace(/{{failedLoginTimoutMinutes}}/, failedLoginTimoutMinutes.toString())
        .replace(/{{failedLoginAttempts}}/, failedLoginAttempts);

    await sendEmail({
        toAddress: user.email,
        subject: "Account Temporarily Locked",
        textBody: body
    });
}
