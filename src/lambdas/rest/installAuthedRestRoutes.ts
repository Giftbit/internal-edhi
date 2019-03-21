import * as cassava from "cassava";
import {installPingRest} from "./ping";
import {installChangePasswordRest} from "./changePassword";

/**
 * Install REST routes that require valid authorization.
 */
export function installAuthedRestRoutes(router: cassava.Router): void {
    installChangePasswordRest(router);
    installPingRest(router);
}
