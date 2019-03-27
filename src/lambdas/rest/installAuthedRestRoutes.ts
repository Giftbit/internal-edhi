import * as cassava from "cassava";
import {installPingRest} from "./ping";
import {installChangePasswordRest} from "./changePassword";
import {installAccountRest} from "./account";

/**
 * Install REST routes that require valid authorization.
 */
export function installAuthedRestRoutes(router: cassava.Router): void {
    installAccountRest(router);
    installChangePasswordRest(router);
    installPingRest(router);
}
