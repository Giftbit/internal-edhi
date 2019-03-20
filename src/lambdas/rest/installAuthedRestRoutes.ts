import * as cassava from "cassava";
import {installPingRest} from "./ping";

/**
 * Install REST routes that require valid authorization.
 */
export function installAuthedRestRoutes(router: cassava.Router): void {
    installPingRest(router);
}
