export function stripUserIdTestMode(userId: string): string {
    if (isTestModeUserId(userId)) {
        userId = userId.substring(0, userId.length - 5);
    }
    return userId;
}

export function setUserIdTestMode(userId: string): string {
    if (isTestModeUserId(userId)) {
        return userId;
    }
    return userId + "-TEST";
}

export function isTestModeUserId(userId: string): boolean {
    return userId && userId.endsWith("-TEST");
}
