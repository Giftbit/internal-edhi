export interface TeamMember {

    userId: string;
    teamMemberId: string;
    invitation?: TeamMemberInvitation;
    roles: string[];
    dateCreated: string;

}

export interface TeamMemberInvitation {
    email: string;
    dateCreated: string;
    dateExpires: string;
}
