import * as bcrypt from "bcrypt";
import {UserPassword} from "../../../model/User";
import {dateCreatedNow} from "../../../dynamodb";

export async function hashPassword(plainTextPassword: string): Promise<UserPassword> {
    if (typeof plainTextPassword !== "string") {
        throw new Error("password must be a string");
    }
    if (plainTextPassword.length < 8) {
        throw new Error("password must be at least 8 chatacters");
    }

    // Always use the preferred password hashing method.
    const hash = await bcrypt.hash(plainTextPassword, 10);
    return {
        algorithm: "BCRYPT",
        hash,
        dateCreated: dateCreatedNow()
    };
}

export function validatePassword(plainTextPassword: string, userPassword: UserPassword): Promise<boolean> {
    switch (userPassword.algorithm) {
        case "BCRYPT":
            return validateBcrypt10Password(plainTextPassword, userPassword);
    }
}

async function validateBcrypt10Password(plainTextPassword: string, userPassword: UserPassword): Promise<boolean> {
    return await bcrypt.compare(plainTextPassword, userPassword.hash);
}
