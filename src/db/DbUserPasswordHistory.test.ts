import * as chai from "chai";
import * as testUtils from "../utils/testUtils";
import {DbUserPasswordHistory} from "./DbUserPasswordHistory";
import {createdDateNow} from "./dynamodb";
import {hashPassword} from "../utils/passwordUtils";

describe("DbUserPasswordHistory", () => {

    before(async () => {
        await testUtils.resetDb();
    });

    it("returns the original object in fromDbObject(toDbObject())", async () => {
        const original: DbUserPasswordHistory = {
            userId: testUtils.generateId(),
            passwordHistory: {
                [createdDateNow()]: await hashPassword(testUtils.generateId())
            },
            createdDate: createdDateNow()
        };
        const returned = DbUserPasswordHistory.fromDbObject(DbUserPasswordHistory.toDbObject(original));
        chai.assert.deepEqual(returned, original);
    });

    it("can put and get a DbUserPasswordHistory", async () => {
        const userPasswordHistory: DbUserPasswordHistory = {
            userId: testUtils.generateId(),
            passwordHistory: {
                [createdDateNow()]: await hashPassword(testUtils.generateId())
            },
            createdDate: createdDateNow()
        };
        await DbUserPasswordHistory.put(userPasswordHistory);

        const userPasswordHistoryByUserId = await DbUserPasswordHistory.get(userPasswordHistory.userId);
        chai.assert.deepEqual(userPasswordHistoryByUserId, userPasswordHistory);
    });
});
