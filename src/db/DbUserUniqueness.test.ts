import * as chai from "chai";
import * as testUtils from "../utils/testUtils";
import {DbUserUniqueness} from "./DbUserUniqueness";
import {createdDateNow} from "./dynamodb";

describe("DbUserUniqueness", () => {
    it("returns the original object in fromDbObject(toDbObject())", () => {
        const original: DbUserUniqueness = {
            userId: testUtils.generateId(),
            createdDate: createdDateNow()
        };
        const returned = DbUserUniqueness.fromDbObject(DbUserUniqueness.toDbObject(original));
        chai.assert.deepEqual(returned, original);
    });
});
