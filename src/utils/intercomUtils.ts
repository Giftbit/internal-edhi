import * as crypto from "crypto";
import log = require("loglevel");

let intercomSecrets: Promise<IntercomSecrets> | false;

export async function initializeIntercomSecrets(secrets: Promise<IntercomSecrets> | false): Promise<void> {
    intercomSecrets = secrets;
}

export async function hashIntercomUserId(userId: string): Promise<string> {
    if (intercomSecrets === false) {
        log.warn("Intercom is disabled");
        return null;
    }
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
