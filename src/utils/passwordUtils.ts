import * as bcrypt from "bcryptjs";
import {createdDateNow} from "../db/dynamodb";
import {DbUserLogin} from "../db/DbUserLogin";

export async function hashPassword(plaintextPassword: string): Promise<DbUserLogin.Password> {
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
        createdDate: createdDateNow()
    };
}

export function validatePassword(plaintextPassword: string, userPassword: DbUserLogin.Password): Promise<boolean> {
    if (!userPassword) {
        return Promise.resolve(false);
    }

    switch (userPassword.algorithm) {
        case "BCRYPT":
            return validateBcrypt10Password(plaintextPassword, userPassword);
    }
}

async function validateBcrypt10Password(plaintextPassword: string, userPassword: DbUserLogin.Password): Promise<boolean> {
    return await bcrypt.compare(plaintextPassword, userPassword.hash);
}
