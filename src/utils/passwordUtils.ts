import * as bcrypt from "bcrypt";
import {UserPassword} from "../model/User";
import {dateCreatedNow} from "../dynamodb";

export async function hashPassword(plaintextPassword: string): Promise<UserPassword> {
    if (typeof plaintextPassword !== "string") {
        throw new Error("password must be a string");
    }
    if (plaintextPassword.length < 8) {
        throw new Error("password must be at least 8 chatacters");
    }

    // Always use the preferred password hashing method.
    const hash = await bcrypt.hash(plaintextPassword, 10);
    return {
        algorithm: "BCRYPT",
        hash,
        dateCreated: dateCreatedNow()
    };
}

export function validatePassword(plaintextPassword: string, userPassword: UserPassword): Promise<boolean> {
    switch (userPassword.algorithm) {
        case "BCRYPT":
            return validateBcrypt10Password(plaintextPassword, userPassword);
    }
}

async function validateBcrypt10Password(plaintextPassword: string, userPassword: UserPassword): Promise<boolean> {
    return await bcrypt.compare(plaintextPassword, userPassword.hash);
}
