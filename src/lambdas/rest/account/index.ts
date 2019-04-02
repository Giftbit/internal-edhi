import * as aws from "aws-sdk";
import * as cassava from "cassava";
import * as giftbitRoutes from "giftbit-cassava-routes";
import {
    generateUserId,
    getTeamMember,
    getUserBadge,
    getUserBadgeCookies,
    getUserByAuth,
    getUserByEmail,
    stripUserIdTestMode
} from "../../../utils/userUtils";
import {User} from "../../../model/User";
import {TeamMember} from "../../../model/TeamMember";
import {Invite} from "./Invite";
import {dateCreatedNow, dynamodb, teamMemberDynameh, userDynameh} from "../../../dynamodb";
import {sendTeamInvitation} from "./sendTeamInvitationEmail";
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

            const user = await getUserByAuth(auth);
            const teamMember = await switchAccount(user, evt.body.mode, evt.body.userId);
            const userBadge = getUserBadge(user, teamMember, true, true);

            return {
                body: null,
                statusCode: cassava.httpStatusCode.redirect.FOUND,
                headers: {
                    Location: `https://${process.env["LIGHTRAIL_WEBAPP_DOMAIN"]}/app/#`
                },
                cookies: await getUserBadgeCookies(userBadge)
            };
        });

    router.route("/v2/account/users")
        .method("GET")
        .handler(async evt => {
            // TODO list team members
            throw new Error("Not implemented");
        });

    router.route("/v2/account/users/{id}")
        .method("GET")
        .handler(async evt => {
            // TODO read team member
            throw new Error("Not implemented");
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
            auth.requireIds("userId");

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

            await inviteUser(auth, evt.body.email, evt.body.access);
            return {
                body: {},
                statusCode: cassava.httpStatusCode.success.CREATED
            };
        });

    router.route("/v2/account/invites")
        .method("GET")
        .handler(async evt => {
            // TODO list invites
            throw new Error("Not implemented");
        });

    router.route("/v2/account/invites/{id}")
        .method("GET")
        .handler(async evt => {
            // TODO read invite
            throw new Error("Not implemented");
        });

    router.route("/v2/account/invites/{id}")
        .method("DELETE")
        .handler(async evt => {
            // TODO delete invite
            throw new Error("Not implemented");
        });
}

async function switchAccount(user: User, mode?: "live" | "test", accountUserId?: string): Promise<TeamMember> {
    return null;
    // TODO determine correct organization userId, maybe save change, pass user back
}

export async function inviteUser(auth: giftbitRoutes.jwtauth.AuthorizationBadge, email: string, access: "owner" | "full" | "limited"): Promise<Invite> {
    auth.requireIds("userId");
    const accountUserId = stripUserIdTestMode(auth.userId);
    log.info("Inviting user", email, "to organization", accountUserId);

    const updates: (aws.DynamoDB.PutItemInput | aws.DynamoDB.DeleteItemInput | aws.DynamoDB.UpdateItemInput)[] = [];
    const dateCreated = dateCreatedNow();

    let user = await getUserByEmail(email);
    if (user) {
        log.info("Found existing User", user.userId);
    } else {
        const userId = generateUserId();
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

    let teamMember = await getTeamMember(accountUserId, user.userId);
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
        log.info("Creating new TeamMember", teamMember.userId, teamMember.teamMemberId);
    }

    const writeReq = userDynameh.requestBuilder.buildTransactWriteItemsInput(...updates);
    await dynamodb.transactWriteItems(writeReq).promise();

    await sendTeamInvitation({email: email, userId: accountUserId, teamMemberId: user.userId});

    return {
        userId: teamMember.userId,
        teamMemberId: teamMember.teamMemberId,
        email: teamMember.invitation.email,
        dateCreated: teamMember.invitation.dateCreated,
        dateExpires: teamMember.invitation.dateExpires
    };
}

export async function listInvites(auth: giftbitRoutes.jwtauth.AuthorizationBadge): Promise<Invite> {
    return null;
}
