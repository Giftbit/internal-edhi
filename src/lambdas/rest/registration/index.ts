import * as cassava from "cassava";
import * as giftbitRoutes from "giftbit-cassava-routes";
import * as uuid from "uuid/v4";
import {User} from "../../../model/User";
import {Organization} from "../../../model/Organization";
import {buildTransactWriteItemsInput, dateCreatedNow, dynamodb, orgDynameh, userDynameh} from "../../../dynamodb";
import log = require("loglevel");
import {hashPassword} from "./passwordUtils";

export function installRegistrationRest(router: cassava.Router): void {

    router.route("/v2/user/register")
        .method("POST")
        .handler(async evt => {
            evt.validateBody({
                properties: {
                    username: {
                        type: "string"
                    },
                    password: {
                        type: "string"
                    }
                },
                required: ["username", "password"],
                additionalProperties: false
            });

            await createUserAndOrganization({
                username: evt.body.username,
                plainTextPassword: evt.body.plainTextPassword,
                userId: generateUserId()
            });

            return {
                body: {},
                statusCode: cassava.httpStatusCode.success.CREATED
            };
        });
}

function generateUserId(): string {
    return "user-" + uuid().replace(/-/g, "");
}

async function getOrganization(userId: string): Promise<Organization> {
    const getReq = orgDynameh.requestBuilder.buildGetInput(userId);
    const getResp = await dynamodb.getItem(getReq).promise();
    return orgDynameh.responseUnwrapper.unwrapGetOutput(getResp);
}

async function createUser(options: {username: string, plainTextPassword: string, userId: string, teamMemberId: string}): Promise<void> {
    const organization = await getOrganization(options.userId);
    if (!organization) {
        throw new giftbitRoutes.GiftbitRestError(cassava.httpStatusCode.clientError.NOT_FOUND, `User '${options.userId}' not found.`);
    }

    const user: User = {
        username: options.username,
        password: await hashPassword(options.plainTextPassword),
        enabled: true,
        locked: true,
        organizations: {
            [options.userId]: {
                userId: options.userId,
                teamMemberId: options.teamMemberId,
                dateCreated: dateCreatedNow()
            }
        },
        dateCreated: new Date().toISOString()
    };

    const putReq = userDynameh.requestBuilder.addCondition(
        userDynameh.requestBuilder.buildPutInput(user),
        {
            attribute: "username",
            operator: "attribute_not_exists"
        }
    );

    try {
        await dynamodb.putItem(putReq).promise();
    } catch (error) {
        log.error("Error user and organization", error);
        if (error.code === "ConditionalCheckFailedException") {
            throw new giftbitRoutes.GiftbitRestError(cassava.httpStatusCode.clientError.CONFLICT, "User already exists.");
        } else {
            throw error;
        }
    }
}

async function createUserAndOrganization(options: {username: string, plainTextPassword: string, userId: string}): Promise<void> {
    const org: Organization = {
        userId: options.userId,
        dateCreated: dateCreatedNow()
    };

    const putOrgReq = orgDynameh.requestBuilder.addCondition(
        orgDynameh.requestBuilder.buildPutInput(org),
        {
            attribute: "userId",
            operator: "attribute_not_exists"
        }
    );

    const user: User = {
        username: options.username,
        password: await hashPassword(options.plainTextPassword),
        enabled: true,
        locked: true,
        organizations: {
            [options.userId]: {
                userId: options.userId,
                teamMemberId: options.userId,
                dateCreated: dateCreatedNow()
            }
        },
        dateCreated: dateCreatedNow()
    };

    const putUserReq = userDynameh.requestBuilder.addCondition(
        userDynameh.requestBuilder.buildPutInput(user),
        {
            attribute: "username",
            operator: "attribute_not_exists"
        }
    );

    const writeReq = buildTransactWriteItemsInput(putOrgReq, putUserReq);

    try {
        await dynamodb.transactWriteItems(writeReq).promise();
    } catch (error) {
        log.error("Error creating user and organization", error);
        if (error.code === "ConditionalCheckFailedException") {
            throw new giftbitRoutes.GiftbitRestError(cassava.httpStatusCode.clientError.CONFLICT, "Organization or user already exists.");
        } else {
            throw error;
        }
    }
}
