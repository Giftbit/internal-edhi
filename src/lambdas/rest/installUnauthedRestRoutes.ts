import * as cassava from "cassava";
import {installRegistrationRest} from "./registration";
import {installLoginRest} from "./login";
import {installForgotPasswordRest} from "./forgotPassword";

/**
 * Install REST routes that do not require valid authorization.
 */
export function installUnauthedRestRoutes(router: cassava.Router): void {
    installForgotPasswordRest(router);
    installLoginRest(router);
    installRegistrationRest(router);
}
