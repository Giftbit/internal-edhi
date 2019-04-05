export interface TeamMember {

    userId: string;
    teamMemberId: string;
    email: string;

}

// export namespace TeamMember {
//     export async function fromDbTeamMember(tm: DbTeamMember): Promise<TeamMember> {
//         const user = await DbUser.getById(tm.teamMemberId);
//         if (!user) {
//             throw new Error(`Cannot find User for TeamMember ${tm.userId} ${tm.teamMemberId}`);
//         }
//         return {
//             userId: tm.userId,
//             teamMemberId: tm.teamMemberId,
//             email: user.email
//         };
//     }
//
//     export async function fromDbTeamMembers(tms: DbTeamMember[]): Promise<TeamMember[]> {
//
//     }
// }
