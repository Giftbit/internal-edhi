export interface TeamMember {

    userId: string;
    teamMemberId: string;
    invitation?: TeamMemberInvitation;
    roles: string[];
    scopes?: string[];
    dateCreated: string;

}

export interface TeamMemberInvitation {
    email: string;
    dateCreated: string;
    dateExpires: string;
}
