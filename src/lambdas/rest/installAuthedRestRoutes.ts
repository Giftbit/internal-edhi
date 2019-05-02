import * as cassava from "cassava";
import {installPingRest} from "./ping";
import {installChangePasswordRest} from "./changePassword";
import {installAccountRest} from "./account";
import {installApiKeysRest} from "./apiKeys";
import {installChangeEmailAuthedRest} from "./changeEmail";
import {installMfaRest} from "./mfa";
import {installLoginAuthedRest} from "./login";
import {installCustomerSupportRest} from "./customerSupport";

/**
 * Install REST routes that require valid authorization.
 */
export function installAuthedRestRoutes(router: cassava.Router): void {
    installAccountRest(router);
    installApiKeysRest(router);
    installChangeEmailAuthedRest(router);
    installChangePasswordRest(router);
    installCustomerSupportRest(router);
    installLoginAuthedRest(router);
    installMfaRest(router);
    installPingRest(router);
}
