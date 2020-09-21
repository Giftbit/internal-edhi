import * as chai from "chai";
import * as testUtils from "../utils/testUtils";
import {DbUserUniqueness} from "./DbUserUniqueness";

describe("DbUserUniqueness", () => {
    it("returns the original object in fromDbObject(toDbObject())", async () => {
        const original: DbUserUniqueness = {
            userId: testUtils.generateId()
        };
        const returned = DbUserUniqueness.fromDbObject(DbUserUniqueness.toDbObject(original));
        chai.assert.deepEqual(returned, original);
    });
});
