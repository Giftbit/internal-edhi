import * as chai from "chai";
import * as testUtils from "../utils/testUtils";
import {DbTokenAction} from "./DbTokenAction";

describe("DbTokenAction", () => {

    before(async () => {
        await testUtils.resetDb();
    });

    it("returns the original object in fromDbObject(toDbObject())", () => {
        const original = DbTokenAction.generate("emailVerification", 24, {email: "foo@example.com"});
        const returned = DbTokenAction.fromDbObject(DbTokenAction.toDbObject(original));
        chai.assert.deepEqual(returned, original);
    });

    it("can put and get and delete a DbTokenAction", async () => {
        const tokenAction = DbTokenAction.generate("emailVerification", 24, {email: "foo@example.com"});
        await DbTokenAction.put(tokenAction);

        const tokenActionGet = await DbTokenAction.get(tokenAction.token);
        chai.assert.deepEqual(tokenActionGet, tokenAction);

        await DbTokenAction.del(tokenAction);
        const tokenActionGetAfterDelete = await DbTokenAction.get(tokenAction.token);
        chai.assert.isNull(tokenActionGetAfterDelete);
    });
});
