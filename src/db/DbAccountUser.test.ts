import * as chai from "chai";
import * as testUtils from "../utils/testUtils";
import {DbAccountUser} from "./DbAccountUser";
import {createdDateNow} from "./dynamodb";

describe("DbAccountUser", () => {
    it("returns the original object in fromDbObject(toDbObject())", () => {
        const original: DbAccountUser = {
            userId: testUtils.generateId(),
            teamMemberId: testUtils.generateId(),
            accountDisplayName: "asdf",
            userDisplayName: "jkl;",
            roles: [],
            scopes: [],
            createdDate: createdDateNow()
        };
        const returned = DbAccountUser.fromDbObject(DbAccountUser.toDbObject(original));
        chai.assert.deepEqual(returned, original);
    });
});
