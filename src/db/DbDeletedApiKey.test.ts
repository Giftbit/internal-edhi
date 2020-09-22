import * as chai from "chai";
import * as testUtils from "../utils/testUtils";
import {DbDeletedApiKey} from "./DbDeletedApiKey";
import {createdDatePast} from "./dynamodb";
import {DbApiKey} from "./DbApiKey";

describe("DbDeletedApiKey", () => {

    before(async () => {
        await testUtils.resetDb();
    });

    it("returns the original object in fromDbObject(toDbObject())",() => {
        const originalApiKey: DbApiKey = {
            accountId: testUtils.generateId(),
            userId: testUtils.generateId(),
            name: "Test Key",
            tokenId: DbApiKey.generateTokenId(),
            tokenVersion: 3,
            roles: ["simple country lawyer"],
            scopes: ["monkey trial"],
            createdDate: createdDatePast(0, 1)
        };
        const original = DbDeletedApiKey.fromDbApiKey(originalApiKey);
        const returned = DbDeletedApiKey.fromDbObject(DbDeletedApiKey.toDbObject(original));
        chai.assert.deepEqual(returned, original);
    });
});
