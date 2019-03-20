import * as cassava from "cassava";
import {installRegistrationRest} from "./registration";
import {installLoginRest} from "./login";

/**
 * Install REST routes that do not require valid authorization.
 */
export function installUnauthedRestRoutes(router: cassava.Router): void {
    installLoginRest(router);
    installRegistrationRest(router);
}
