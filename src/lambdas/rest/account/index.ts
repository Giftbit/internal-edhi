import * as aws from "aws-sdk";
import * as cassava from "cassava";
import * as giftbitRoutes from "giftbit-cassava-routes";
import {GiftbitRestError} from "giftbit-cassava-routes";
import {DbUser} from "../../../db/DbUser";
import {DbTeamMember} from "../../../db/DbTeamMember";
import {Invitation} from "./Invitation";
import {dateCreatedNow, dynamodb, teamMemberDynameh, userDynameh} from "../../../db/dynamodb";
import {sendTeamInvitation} from "./sendTeamInvitationEmail";
import {stripUserIdTestMode} from "../../../utils/userUtils";
import log = require("loglevel");

export function installAccountRest(router: cassava.Router): void {
    router.route("/v2/account/switch")
        .method("POST")
        .handler(async evt => {
            const auth: giftbitRoutes.jwtauth.AuthorizationBadge = evt.meta["auth"];

            evt.validateBody({
                properties: {
                    mode: {
                        type: "string",
                        enum: ["live", "test"]
                    },
                    userId: {
                        type: "string",
                        minLength: 1
                    }
                },
                required: [],
                additionalProperties: false
            });

            const user = await DbUser.getByAuth(auth);
            const teamMember = await switchAccount(user, evt.body.mode, evt.body.userId);
            const userBadge = DbUser.getBage(user, teamMember, true, true);

            return {
                body: null,
                statusCode: cassava.httpStatusCode.redirect.FOUND,
                headers: {
                    Location: `https://${process.env["LIGHTRAIL_WEBAPP_DOMAIN"]}/app/#`
                },
                cookies: await DbUser.getBadgeCookies(userBadge)
            };
        });

    router.route("/v2/account/users")
        .method("GET")
        .handler(async evt => {
            const auth: giftbitRoutes.jwtauth.AuthorizationBadge = evt.meta["auth"];
            auth.requireIds("userId");
            const teamMembers = await DbTeamMember.getAccountTeamMembers(auth.userId);
            return {
                body: teamMembers
            };
        });

    router.route("/v2/account/users/{id}")
        .method("GET")
        .handler(async evt => {
            const auth: giftbitRoutes.jwtauth.AuthorizationBadge = evt.meta["auth"];
            auth.requireIds("userId");
            const teamMember = await DbTeamMember.get(auth.userId, evt.pathParameters.id);
            if (!teamMember || teamMember.invitation) {
                throw new GiftbitRestError(cassava.httpStatusCode.clientError.NOT_FOUND, `Could not find user with id '${evt.pathParameters.id}'.`, "UserNotFound");
            }
            return {
                body: teamMember
            };
        });

    router.route("/v2/account/users/{id}")
        .method("PATCH")
        .handler(async evt => {
            // TODO update team member
            throw new Error("Not implemented");
        });

    router.route("/v2/account/users/{id}")
        .method("DELETE")
        .handler(async evt => {
            // TODO delete team member
            throw new Error("Not implemented");
        });

    router.route("/v2/account/invites")
        .method("POST")
        .handler(async evt => {
            const auth: giftbitRoutes.jwtauth.AuthorizationBadge = evt.meta["auth"];

            evt.validateBody({
                properties: {
                    email: {
                        type: "string",
                        format: "email"
                    },
                    access: {
                        type: "string",
                        enum: ["owner", "full", "limited"]
                    }
                },
                required: ["email", "access"],
                additionalProperties: false
            });

            const invitation = await inviteUser(auth, evt.body.email, evt.body.access);
            return {
                body: invitation,
                statusCode: cassava.httpStatusCode.success.CREATED
            };
        });

    router.route("/v2/account/invites")
        .method("GET")
        .handler(async evt => {
            const auth: giftbitRoutes.jwtauth.AuthorizationBadge = evt.meta["auth"];
            const invites = await listInvites(auth);
            return {
                body: invites
            }
        });

    router.route("/v2/account/invites/{id}")
        .method("GET")
        .handler(async evt => {
            const auth: giftbitRoutes.jwtauth.AuthorizationBadge = evt.meta["auth"];
            const invite = await getInvite(auth, evt.pathParameters.id);
            if (!invite) {
                throw new GiftbitRestError(cassava.httpStatusCode.clientError.NOT_FOUND, `Could not find invite with id '${evt.pathParameters.id}'.`, "InviteNotFound");
            }
            return {
                body: invite
            };
        });

    router.route("/v2/account/invites/{id}")
        .method("DELETE")
        .handler(async evt => {
            const auth: giftbitRoutes.jwtauth.AuthorizationBadge = evt.meta["auth"];
            await cancelInvite(auth, evt.pathParameters.id);
            return {
                body: {}
            };
        });
}

async function switchAccount(user: DbUser, mode?: "live" | "test", accountUserId?: string): Promise<DbTeamMember> {
    return null;
    // TODO determine correct organization userId, maybe save change, pass user back
}

export async function inviteUser(auth: giftbitRoutes.jwtauth.AuthorizationBadge, email: string, access: "owner" | "full" | "limited"): Promise<Invitation> {
    auth.requireIds("userId");
    const accountUserId = stripUserIdTestMode(auth.userId);
    log.info("Inviting user", email, "to organization", accountUserId);

    const updates: (aws.DynamoDB.PutItemInput | aws.DynamoDB.DeleteItemInput | aws.DynamoDB.UpdateItemInput)[] = [];
    const dateCreated = dateCreatedNow();

    let user = await DbUser.getByEmail(email);
    if (user) {
        log.info("Found existing User", user.userId);
    } else {
        const userId = DbUser.generateUserId();
        user = {
            email: email,
            userId,
            emailVerified: false,
            frozen: false,
            defaultLoginUserId: accountUserId,
            dateCreated
        };
        const putUserReq = userDynameh.requestBuilder.buildPutInput(user);
        userDynameh.requestBuilder.addCondition(putUserReq, {
            attribute: "email",
            operator: "attribute_not_exists"
        });
        updates.push(putUserReq);
        log.info("Creating new User", user.userId);
    }

    let teamMember = await DbTeamMember.get(accountUserId, user.userId);
    if (teamMember) {
        log.info("Found existing TeamMember", teamMember.userId, teamMember.teamMemberId);
        if (teamMember.invitation) {
            // TODO update and resend invitation
        } else {
            throw new giftbitRoutes.GiftbitRestError(cassava.httpStatusCode.clientError.CONFLICT, `The user ${email} has already accepted an invitation.`);
        }
    } else {
        const dateExpires = new Date();
        dateExpires.setDate(dateExpires.getDate() + 5);
        teamMember = {
            userId: accountUserId,
            teamMemberId: user.userId,
            invitation: {
                email: email,
                dateCreated,
                dateExpires: dateExpires.toISOString()
            },
            roles: [],  // TODO base on access
            dateCreated
        };
        const putTeamMemberReq = teamMemberDynameh.requestBuilder.buildPutInput(teamMember);
        teamMemberDynameh.requestBuilder.addCondition(putTeamMemberReq, {
            attribute: "userId",
            operator: "attribute_not_exists"
        });
        updates.push(putTeamMemberReq);
        log.info("Invited new TeamMember", teamMember.userId, teamMember.teamMemberId);
    }

    const writeReq = userDynameh.requestBuilder.buildTransactWriteItemsInput(...updates);
    await dynamodb.transactWriteItems(writeReq).promise();

    await sendTeamInvitation({email: email, userId: accountUserId, teamMemberId: user.userId});

    return Invitation.fromTeamMember(teamMember);
}

export async function listInvites(auth: giftbitRoutes.jwtauth.AuthorizationBadge): Promise<Invitation[]> {
    auth.requireIds("userId");
    const teamMembers = await DbTeamMember.getAccountInvitedTeamMembers(auth.userId);
    return teamMembers.map(Invitation.fromTeamMember);
}

export async function getInvite(auth: giftbitRoutes.jwtauth.AuthorizationBadge, teamMemberId: string): Promise<Invitation> {
    auth.requireIds("userId");
    const teamMember = await DbTeamMember.get(auth.userId, teamMemberId);
    if (!teamMember || !teamMember.invitation) {
        return null;
    }
    return Invitation.fromTeamMember(teamMember);
}

export async function cancelInvite(auth: giftbitRoutes.jwtauth.AuthorizationBadge, teamMemberId: string): Promise<void> {
    auth.requireIds("userId");
    log.info("Cancel invitation", auth.userId, teamMemberId);

    const req = teamMemberDynameh.requestBuilder.buildDeleteInput({
        userId: stripUserIdTestMode(auth.userId),
        teamMemberId: stripUserIdTestMode(teamMemberId)
    });
    teamMemberDynameh.requestBuilder.addCondition(req, {
        attribute: "invitation",
        operator: "attribute_exists"
    });

    try {
        await dynamodb.deleteItem(req).promise();
    } catch (error) {
        if (error.code === "ConditionalCheckFailedException") {
            log.info("The invitation cannot be deleted because it was already accepted");
            throw new GiftbitRestError(cassava.httpStatusCode.clientError.CONFLICT, "The invitation cannot be deleted because it was already accepted.", "InvitationAccepted");
        }
        throw error;
    }
}
