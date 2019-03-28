import * as cassava from "cassava";
import * as giftbitRoutes from "giftbit-cassava-routes";
import {
    generateUserId,
    getTeamMember,
    getUserBadge,
    getUserBadgeCookies,
    getUserByAuth,
    getUserByEmail
} from "../../../utils/userUtils";
import {User} from "../../../model/User";
import {TeamMember} from "../../../model/TeamMember";
import {Invitation} from "./Invitation";
import * as aws from "aws-sdk";
import {dateCreatedNow, dynamodb, teamMemberDynameh, tokenActionDynameh, userDynameh} from "../../../dynamodb";
import {TokenAction} from "../../../model/TokenAction";

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

            await inviteUser({accountUserId: auth.userId, email: evt.body.email, access: evt.body.access});
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

export async function inviteUser(params: { accountUserId: string, email: string, access: "owner" | "full" | "limited" }): Promise<Invitation> {
    const updates: (aws.DynamoDB.PutItemInput | aws.DynamoDB.DeleteItemInput | aws.DynamoDB.UpdateItemInput)[] = [];
    const dateCreated = dateCreatedNow();

    let user = await getUserByEmail(params.email);
    if (!user) {
        const userId = generateUserId();
        user = {
            email: params.email,
            userId,
            emailVerified: false,
            frozen: false,
            defaultLoginUserId: userId,
            dateCreated
        };
        updates.push(userDynameh.requestBuilder.buildConditionalPutInput(
            user,
            {
                attribute: "email",
                operator: "attribute_not_exists"
            }
        ));
    }

    let teamMember = await getTeamMember(params.accountUserId, user.userId);
    if (teamMember) {
        if (teamMember.invitation) {
            // TODO update and resend invitation
        } else {
            throw new giftbitRoutes.GiftbitRestError(cassava.httpStatusCode.clientError.CONFLICT, `The user ${params.email} has already accepted an invitation.`);
        }
    } else {
        const tokenAction = TokenAction.generate("acceptTeamInvite", 5, {
            email: params.email,
            userId: params.accountUserId,
            teamMemberId: user.userId
        });
        updates.push(tokenActionDynameh.requestBuilder.buildPutInput(tokenAction));

        const dateExpires = new Date();
        dateExpires.setDate(dateExpires.getDate() + 5);
        teamMember = {
            userId: params.accountUserId,
            teamMemberId: user.userId,
            invitation: {
                email: params.email,
                dateCreated,
                dateExpires: dateExpires.toISOString()
            },
            roles: [],  // TODO base on access
            dateCreated
        };
        updates.push(teamMemberDynameh.requestBuilder.buildPutInput(teamMember));
    }

    const writeReq = userDynameh.requestBuilder.buildTransactWriteItemsInput(...updates);
    await dynamodb.transactWriteItems(writeReq).promise();

    return {
        userId: teamMember.userId,
        teamMemberId: teamMember.teamMemberId,
        email: teamMember.invitation.email,
        dateCreated: teamMember.invitation.dateCreated,
        dateExpires: teamMember.invitation.dateExpires
    };
}
