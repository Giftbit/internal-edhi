import {DbObject} from "./DbObject";
import {stripUserIdTestMode} from "../utils/userUtils";

/**
 * Is stored in the database to guarantee that when users are created that they
 * have a unique userId.  DbUser is stored by email as the primary key and thus
 * can't guarantee uniqueness on the userId.
 */
export interface DbUserUniqueness {

    /**
     * The primary key.
     */
    userId: string;
}

export namespace DbUserUniqueness {

    export function fromDbObject(o: DbObject): DbUserUniqueness {
        if (!o) {
            return null;
        }
        const userDetails = {...o};
        delete userDetails.pk;
        delete userDetails.sk;
        return userDetails as any;
    }

    export function toDbObject(userDetails: DbUserUniqueness): DbUserUniqueness & DbObject {
        if (!userDetails) {
            return null;
        }
        return {
            ...userDetails,
            ...getKeys(userDetails)
        };
    }

    export function getKeys(userDetails: DbUserUniqueness): DbObject {
        if (!userDetails || !userDetails.userId) {
            throw new Error("Not a valid UserDetails.");
        }
        return {
            pk: "User/" + userDetails.userId,
            sk: "User/" + userDetails.userId
        };
    }

    export async function get(userId: string): Promise<DbUserUniqueness> {
        userId = stripUserIdTestMode(userId);
        return fromDbObject(await DbObject.get("User/" + userId, "User/" + userId));
    }
}
