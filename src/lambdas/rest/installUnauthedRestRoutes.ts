import * as cassava from "cassava";
import {installRegistrationRest} from "./registration";
import {installLoginUnauthedRest} from "./login";
import {installForgotPasswordRest} from "./forgotPassword";
import {installChangeEmailUnauthedRest} from "./changeEmail";

/**
 * Install REST routes that do not require valid authorization.
 */
export function installUnauthedRestRoutes(router: cassava.Router): void {
    installChangeEmailUnauthedRest(router);
    installForgotPasswordRest(router);
    installLoginUnauthedRest(router);
    installRegistrationRest(router);
}
