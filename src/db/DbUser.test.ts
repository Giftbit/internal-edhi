import * as chai from "chai";
import * as testUtils from "../utils/testUtils";
import {generateId} from "../utils/testUtils";
import {DbUser} from "./DbUser";
import {createdDateNow} from "./dynamodb";

describe("DbUser", () => {
    it("returns the original object in fromDbObject(toDbObject())", () => {
        const original: DbUser = {
            userId: testUtils.generateId(),
            email: `${generateId()}@example.com`,
            createdDate: createdDateNow()
        };
        const returned = DbUser.fromDbObject(DbUser.toDbObject(original));
        chai.assert.deepEqual(returned, original);
    });
});
