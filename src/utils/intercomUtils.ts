import * as crypto from "crypto";

let intercomSecrets: Promise<IntercomSecrets>;

export async function initializeIntercomSecrets(secrets: Promise<IntercomSecrets>): Promise<void> {
    intercomSecrets = secrets;
}

export async function hashIntercomUserId(userId: string): Promise<string> {
    if (!intercomSecrets) {
        throw new Error("Intercom secrets have not been initialized.");
    }
    return crypto.createHmac("sha256", (await intercomSecrets).secretKey)
        .update(userId)
        .digest("hex");
}

export interface IntercomSecrets {
    secretKey: string;
}
