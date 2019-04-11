/**
 * This is a v1 concept I suspect we'll move away from.
 */
export type UserPrivilege = "OWNER" | "FULL_ACCESS" | "LIMITED_ACCESS";

/**
 * Map UserPrivilege to Roles exactly how v1 implemented it.
 */
export function getRolesForUserPrivilege(userPrivilege: UserPrivilege): string[] {
    switch (userPrivilege) {
        case "OWNER":
            return ["webPortal", "pointOfSale", "teamAdmin", "accountManager", "programManager", "contactManager", "customerServiceRepresentative", "customerServiceManager", "promoter", "reporter", "securityManager"];
        case "FULL_ACCESS":
            return ["webPortal", "pointOfSale", "teamAdmin", "accountManager", "programManager", "contactManager", "customerServiceRepresentative", "customerServiceManager", "promoter", "reporter", "securityManager"];
        case "LIMITED_ACCESS":
            return ["webPortal", "pointOfSale", "accountManager", "programManager", "contactManager", "customerServiceRepresentative", "customerServiceManager", "promoter", "reporter", "securityManager"];
        default:
            throw new Error(`Unknown UserPrivilege '${userPrivilege}'`);
    }
}
