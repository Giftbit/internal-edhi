import * as bcrypt from "bcryptjs";
import * as cassava from "cassava";
import * as giftbitRoutes from "giftbit-cassava-routes";
import {createdDateNow} from "../db/dynamodb";
import {DbUser} from "../db/DbUser";

// Derived from https://github.com/danielmiessler/SecLists/blob/master/Passwords/Common-Credentials/10-million-password-list-top-100000.txt
// with length < 8 and all digits removed then sorted case-sensitive.
const commonPasswords: string[] = require("./commonPasswords.json");

export async function hashPassword(plaintextPassword: string): Promise<DbUser.Password> {
    if (typeof plaintextPassword !== "string") {
        throw new Error("password must be a string");
    }
    if (plaintextPassword.length < 8) {
        throw new giftbitRoutes.GiftbitRestError(cassava.httpStatusCode.clientError.UNPROCESSABLE_ENTITY, "Your password must be at least 8 characters.");
    }
    if (/^\d+$/.test(plaintextPassword)) {
        throw new giftbitRoutes.GiftbitRestError(cassava.httpStatusCode.clientError.UNPROCESSABLE_ENTITY, "Your password can not be all digits.");
    }
    if (findInSortedList(plaintextPassword, commonPasswords)) {
        throw new giftbitRoutes.GiftbitRestError(cassava.httpStatusCode.clientError.UNPROCESSABLE_ENTITY, "Your password is known to be common and easily guessed.");
    }

    // Always use the preferred password hashing method.
    const hash = await bcrypt.hash(plaintextPassword, 10);
    return {
        algorithm: "BCRYPT",
        hash,
        createdDate: createdDateNow()
    };
}

function findInSortedList(needle: string, haystack: string[]): boolean {
    let low = 0;
    let high = haystack.length - 1;
    while (low <= high) {
        const pivot = (low + high) / 2 | 0;
        if (needle === haystack[pivot]) {
            return true;
        } else if (needle > haystack[pivot]) {
            low = pivot + 1;
        } else {
            high = pivot - 1;
        }
    }
    return false;
}

export function validatePassword(plaintextPassword: string, userPassword: DbUser.Password): Promise<boolean> {
    if (!userPassword) {
        return Promise.resolve(false);
    }

    switch (userPassword.algorithm) {
        case "BCRYPT":
            return validateBcrypt10Password(plaintextPassword, userPassword);
        default:
            throw new Error("Unknown password algorithm.");
    }
}

async function validateBcrypt10Password(plaintextPassword: string, userPassword: DbUser.Password): Promise<boolean> {
    return await bcrypt.compare(plaintextPassword, userPassword.hash);
}
