import * as cassava from "cassava";
import * as giftbitRoutes from "giftbit-cassava-routes";
import * as logPrefix from "loglevel-plugin-prefix";
import {installUnauthedRestRoutes} from "./installUnauthedRestRoutes";
import {installAuthedRestRoutes} from "./installAuthedRestRoutes";
import {initializeLightrailStripeConfig} from "../../utils/stripeUtils";
import {DbUserLogin} from "../../db/DbUserLogin";
import {initializeOtpEncryptionSecrets} from "../../utils/otpUtils";
import {initializeTwilioCredentials, TwilioCredentialsConfig} from "../../utils/smsUtils";
import log = require("loglevel");

// Wrapping console.log instead of binding (default behaviour for loglevel)
// Otherwise all log calls are prefixed with the requestId from the first
// request the lambda received (AWS modifies log calls, loglevel binds to the
// version of console.log that exists when it is initialized).
// See https://github.com/pimterry/loglevel/blob/master/lib/loglevel.js
// tslint:disable-next-line:no-console
log.methodFactory = () => (...args) => console.log(...args);

// Prefix log messages with the level.
logPrefix.reg(log);
logPrefix.apply(log, {
    format: (level, name, timestamp) => {
        return `[${level}]`;
    },
});

// Set the log level when running in Lambda.
log.setLevel(log.levels.INFO);

const router = new cassava.Router();

router.route(new cassava.routes.LoggingRoute({
    logFunction: log.info
}));

router.route(new giftbitRoutes.MetricsRoute({
    logFunction: log.info
}));

installUnauthedRestRoutes(router);

const authConfigPromise = giftbitRoutes.secureConfig.fetchFromS3ByEnvVar<giftbitRoutes.secureConfig.AuthenticationConfig>("SECURE_CONFIG_BUCKET", "SECURE_CONFIG_KEY_JWT");
router.route(new giftbitRoutes.jwtauth.JwtAuthorizationRoute({
    authConfigPromise: authConfigPromise,
    rolesConfigPromise: giftbitRoutes.secureConfig.fetchFromS3ByEnvVar<any>("SECURE_CONFIG_BUCKET", "SECURE_CONFIG_KEY_ROLE_DEFINITIONS"),
    sharedSecretProvider: new giftbitRoutes.jwtauth.sharedSecret.RestSharedSecretProvider(`https://${process.env["LIGHTRAIL_DOMAIN"]}/v1/storage/jwtSecret`, giftbitRoutes.secureConfig.fetchFromS3ByEnvVar<giftbitRoutes.secureConfig.AssumeScopeToken>("SECURE_CONFIG_BUCKET", "SECURE_CONFIG_KEY_ASSUME_STORAGE_SCOPE_TOKEN"),
    ),
    infoLogFunction: log.info,
    errorLogFunction: log.error
}));
DbUserLogin.initializeBadgeSigningSecrets(authConfigPromise);

initializeLightrailStripeConfig(
    giftbitRoutes.secureConfig.fetchFromS3ByEnvVar<giftbitRoutes.secureConfig.StripeConfig>("SECURE_CONFIG_BUCKET", "SECURE_CONFIG_KEY_STRIPE")
);

initializeTwilioCredentials(
    giftbitRoutes.secureConfig.fetchFromS3ByEnvVar<TwilioCredentialsConfig>("SECURE_CONFIG_BUCKET", "SECURE_CONFIG_KEY_TWILIO")
);

initializeOtpEncryptionSecrets(
    giftbitRoutes.secureConfig.fetchFromS3ByEnvVar<{ key: string }>("SECURE_CONFIG_BUCKET", "SECURE_CONFIG_KEY_OTP")
);

installAuthedRestRoutes(router);

// Export the lambda handler with Sentry error logging supported.
export const handler = giftbitRoutes.sentry.wrapLambdaHandler({
    router,
    logger: log.error,
    secureConfig: giftbitRoutes.secureConfig.fetchFromS3ByEnvVar<any>("SECURE_CONFIG_BUCKET", "SECURE_CONFIG_KEY_SENTRY")
});
