import * as cassava from "cassava";
import {installRegistrationRest} from "./registration";

/**
 * Install REST routes that do not require valid authorization.
 */
export function installUnauthedRestRoutes(router: cassava.Router): void {
    installRegistrationRest(router);
}
