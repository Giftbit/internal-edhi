export interface User {

    username: string;
    password?: string;
    enabled: boolean;
    locked: boolean;
    twoFactorAuthenticationDevice?: string;
    organizations: {[userId: string]: UserOrganization};
    dateCreated: string;

}

export interface UserOrganization {

    userId: string;
    teamMemberId: string;
    dateCreated: string;

}
