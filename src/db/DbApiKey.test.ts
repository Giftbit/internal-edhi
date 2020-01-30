import * as chai from "chai";
import * as testUtils from "../utils/testUtils";
import {DbApiKey} from "./DbApiKey";
import {createdDateNow} from "./dynamodb";

describe("DbApiKey", () => {

    before(async () => {
        await testUtils.resetDb();
    });

    it("returns the original object in fromDbObject(toDbObject())", () => {
        const original: DbApiKey = {
            userId: testUtils.generateId(),
            teamMemberId: testUtils.generateId(),
            name: "Test Key",
            tokenId: DbApiKey.generateTokenId(),
            tokenVersion: 3,
            roles: [],
            scopes: [],
            createdDate: createdDateNow()
        };
        const returned = DbApiKey.fromDbObject(DbApiKey.toDbObject(original));
        chai.assert.deepEqual(returned, original);
    });

    it("can put and get an ApiKey by Account", async () => {
        const apiKey: DbApiKey = {
            userId: testUtils.generateId(),
            teamMemberId: testUtils.generateId(),
            name: "Test Key",
            tokenId: DbApiKey.generateTokenId(),
            tokenVersion: 3,
            roles: [],
            scopes: [],
            createdDate: createdDateNow()
        };
        await DbApiKey.put(apiKey);

        const apiKeyByAccount = await DbApiKey.getByAccount(apiKey.userId, apiKey.tokenId);
        chai.assert.deepEqual(apiKeyByAccount, apiKey);
    });

    it("can put and get an ApiKey by User", async () => {
        const apiKey: DbApiKey = {
            userId: testUtils.generateId(),
            teamMemberId: testUtils.generateId(),
            name: "Test Key",
            tokenId: DbApiKey.generateTokenId(),
            tokenVersion: 3,
            roles: [],
            scopes: [],
            createdDate: createdDateNow()
        };
        await DbApiKey.put(apiKey);

        const apiKeyByUser = await DbApiKey.getByUser(apiKey.teamMemberId, apiKey.tokenId);
        chai.assert.deepEqual(apiKeyByUser, apiKey);
    });

    it("can get ApiKeys by Account, User or AccountUser", async () => {
        const accountId1 = testUtils.generateId();
        const accountId2 = testUtils.generateId();
        const userId1 = testUtils.generateId();
        const userId2 = testUtils.generateId();
        const userId3 = testUtils.generateId();

        const account1User1Key: DbApiKey = {
            userId: accountId1,
            teamMemberId: userId1,
            name: "account1, user1",
            tokenId: DbApiKey.generateTokenId(),
            tokenVersion: 3,
            roles: [],
            scopes: [],
            createdDate: createdDateNow()
        };
        await DbApiKey.put(account1User1Key);

        const account1User1Key2: DbApiKey = {
            userId: accountId1,
            teamMemberId: userId1,
            name: "account1, user1",
            tokenId: DbApiKey.generateTokenId(),
            tokenVersion: 3,
            roles: [],
            scopes: [],
            createdDate: createdDateNow()
        };
        await DbApiKey.put(account1User1Key2);

        const account1User2Key: DbApiKey = {
            userId: accountId1,
            teamMemberId: userId2,
            name: "account1, user2",
            tokenId: DbApiKey.generateTokenId(),
            tokenVersion: 3,
            roles: [],
            scopes: [],
            createdDate: createdDateNow()
        };
        await DbApiKey.put(account1User2Key);

        const account2User2Key: DbApiKey = {
            userId: accountId2,
            teamMemberId: userId2,
            name: "account2, user2",
            tokenId: DbApiKey.generateTokenId(),
            tokenVersion: 3,
            roles: [],
            scopes: [],
            createdDate: createdDateNow()
        };
        await DbApiKey.put(account2User2Key);

        const account2User3Key: DbApiKey = {
            userId: accountId2,
            teamMemberId: userId3,
            name: "account2, user3",
            tokenId: DbApiKey.generateTokenId(),
            tokenVersion: 3,
            roles: [],
            scopes: [],
            createdDate: createdDateNow()
        };
        await DbApiKey.put(account2User3Key);

        const account1ApiKeys = await DbApiKey.getAllForAccount(accountId1);
        chai.assert.sameDeepMembers(account1ApiKeys, [account1User1Key, account1User1Key2, account1User2Key]);

        const account2ApiKeys = await DbApiKey.getAllForAccount(accountId2);
        chai.assert.sameDeepMembers(account2ApiKeys, [account2User2Key, account2User3Key]);

        const unusedAccountApiKeys = await DbApiKey.getAllForAccount(testUtils.generateId());
        chai.assert.lengthOf(unusedAccountApiKeys, 0);

        const user1ApiKeys = await DbApiKey.getAllForUser(userId1);
        chai.assert.sameDeepMembers(user1ApiKeys, [account1User1Key, account1User1Key2]);

        const user2ApiKeys = await DbApiKey.getAllForUser(userId2);
        chai.assert.sameDeepMembers(user2ApiKeys, [account1User2Key, account2User2Key]);

        const user3ApiKeys = await DbApiKey.getAllForUser(userId3);
        chai.assert.sameDeepMembers(user3ApiKeys, [account2User3Key]);

        const unusedUserApiKeys = await DbApiKey.getAllForUser(testUtils.generateId());
        chai.assert.lengthOf(unusedUserApiKeys, 0);

        const account2User2ApiKeys = await DbApiKey.getAllForAccountUser(accountId2, userId2);
        chai.assert.sameDeepMembers(account2User2ApiKeys, [account2User2Key]);
    });
});
