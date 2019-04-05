import * as uuid from "uuid/v4";
import {DbObject} from "./DbObject";
import {stripUserIdTestMode} from "../utils/userUtils";

export interface DbUserDetails {

    userId: string;
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
            pk: "UserDetails/" + userDetails.userId,
            sk: "UserDetails/" + userDetails.userId
        }
    }

    export async function get(userId: string): Promise<DbUserDetails> {
        return fromDbObject(await DbObject.get("UserDetails/" + stripUserIdTestMode(userId), "UserDetails/" + stripUserIdTestMode(userId)));
    }

    export function generateUserId(): string {
        return "user-" + uuid().replace(/-/g, "");
    }
}
