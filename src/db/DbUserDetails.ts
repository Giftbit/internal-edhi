import * as giftbitRoutes from "giftbit-cassava-routes";
import * as uuid from "uuid/v4";
import {DbObject} from "./DbObject";
import {stripUserIdTestMode} from "../utils/userUtils";

export interface DbUserDetails {

    /**
     * The primary index.
     */
    userId: string;

    /**
     * This email address *must* match the entry in the UserLogin.  It may show up
     * in other places that are non-authoritative.
     */
    email: string;

}

export namespace DbUserDetails {

    export function fromDbObject(o: DbObject): DbUserDetails {
        if (!o) {
            return null;
        }
        const userDetails = {...o};
        delete userDetails.pk;
        delete userDetails.sk;
        return userDetails as any;
    }

    export function toDbObject(userDetails: DbUserDetails) {
        if (!userDetails) {
            return null;
        }
        return {
            ...userDetails,
            ...getKeys(userDetails)
        };
    }

    export function getKeys(userDetails: DbUserDetails): DbObject {
        if (!userDetails || !userDetails.userId) {
            throw new Error("Not a valid UserDetails.");
        }
        return {
            pk: "User/" + userDetails.userId,
            sk: "User/" + userDetails.userId
        };
    }

    export async function get(userId: string): Promise<DbUserDetails> {
        userId = stripUserIdTestMode(userId);
        return fromDbObject(await DbObject.get("User/" + userId, "User/" + userId));
    }

    export async function getByAuth(auth: giftbitRoutes.jwtauth.AuthorizationBadge): Promise<DbUserDetails> {
        auth.requireIds("teamMemberId");
        const user = await get(stripUserIdTestMode(auth.teamMemberId));
        if (!user) {
            throw new Error(`Could not find authed UserDetails ${auth.teamMemberId}`);
        }
        return user;
    }

    export function generateUserId(): string {
        return "user-" + uuid().replace(/-/g, "");
    }
}
