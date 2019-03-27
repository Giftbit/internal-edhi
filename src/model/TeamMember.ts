export interface TeamMember {

    userId: string;
    teamMemberId: string;
    // status?: "invited" | "active";
    invitationEmail?: string;
    roles: string[];
    dateCreated: string;

}
