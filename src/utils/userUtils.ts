export function stripUserIdTestMode(userId: string): string {
    if (userId.endsWith("-TEST")) {
        userId = userId.substring(0, userId.length - 5);
    }
    return userId;
}
