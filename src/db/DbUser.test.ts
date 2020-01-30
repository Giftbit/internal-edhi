import * as chai from "chai";
import * as testUtils from "../utils/testUtils";
import {generateId} from "../utils/testUtils";
import {DbUser} from "./DbUser";

describe("DbUser", () => {
    it("returns the original object in fromDbObject(toDbObject())", () => {
        const original: DbUser = {
            userId: testUtils.generateId(),
            email: `${generateId()}@example.com`
        };
        const returned = DbUser.fromDbObject(DbUser.toDbObject(original));
        chai.assert.deepEqual(returned, original);
    });
});
