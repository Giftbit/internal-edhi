import * as cassava from "cassava";
import {installPingRest} from "./ping";
import {installChangePasswordRest} from "./changePassword";
import {installOrganizationsRest} from "./organizations";

/**
 * Install REST routes that require valid authorization.
 */
export function installAuthedRestRoutes(router: cassava.Router): void {
    installChangePasswordRest(router);
    installOrganizationsRest(router);
    installPingRest(router);
}
