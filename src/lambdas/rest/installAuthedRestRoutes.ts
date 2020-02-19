import * as cassava from "cassava";
import {installPingRest} from "./ping";
import {installAccountRest} from "./account";
import {installAccountInvitationsRest} from "./accountInvitations";
import {installAccountSecurityRest} from "./accountSecurity";
import {installApiKeysRest} from "./apiKeys";
import {installChangeEmailAuthedRest} from "./changeEmail";
import {installChangePasswordRest} from "./changePassword";
import {installCustomerSupportRest} from "./customerSupport";
import {installLoginAuthedRest} from "./login";
import {installMfaRest} from "./mfa";
import {installPaymentsRest} from "./payments";
import {installUserRest} from "./user";

/**
 * Install REST routes that require valid authorization.
 */
export function installAuthedRestRoutes(router: cassava.Router): void {
    installAccountRest(router);
    installAccountInvitationsRest(router);
    installAccountSecurityRest(router);
    installApiKeysRest(router);
    installChangeEmailAuthedRest(router);
    installChangePasswordRest(router);
    installCustomerSupportRest(router);
    installLoginAuthedRest(router);
    installMfaRest(router);
    installPaymentsRest(router);
    installPingRest(router);
    installUserRest(router);
}
