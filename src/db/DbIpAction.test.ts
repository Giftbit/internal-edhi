import * as chai from "chai";
import * as testUtils from "../utils/testUtils";
import {DbIpAction} from "./DbIpAction";

describe("DbIpAction", () => {

    before(async () => {
        await testUtils.resetDb();
    });

    it("returns the original object in fromDbObject(toDbObject())", async () => {
        const original = DbIpAction.create("registration", "192.168.0.1");
        const returned = DbIpAction.fromDbObject(DbIpAction.toDbObject(original));
        chai.assert.deepEqual(returned, original);
    });

    it("can add and get", async () => {
        const ipActions0 = await DbIpAction.getAll("registration", "192.168.0.1");
        chai.assert.lengthOf(ipActions0, 0);

        await DbIpAction.putOne("registration", "192.168.0.1");
        const ipActions1 = await DbIpAction.getAll("registration", "192.168.0.1");
        chai.assert.lengthOf(ipActions1, 1);

        await DbIpAction.putOne("registration", "192.168.0.1");
        const ipActions2 = await DbIpAction.getAll("registration", "192.168.0.1");
        chai.assert.lengthOf(ipActions2, 2);

        await DbIpAction.putOne("registration", "192.168.0.2");
        const ipActionsNew1 = await DbIpAction.getAll("registration", "192.168.0.2");
        chai.assert.lengthOf(ipActionsNew1, 1);
        const ipActionsOg2 = await DbIpAction.getAll("registration", "192.168.0.1");
        chai.assert.lengthOf(ipActionsOg2, 2);
    });

    it("limits the number of times an action can be taken by IP address", async () => {
        for (let i = 0; i < 10; i++) {
            const canTake = await DbIpAction.canTakeAction("registration", "192.168.0.3");
            chai.assert.isTrue(canTake, `iteration ${i}`);
        }

        const cantTake = await DbIpAction.canTakeAction("registration", "192.168.0.3");
        chai.assert.isFalse(cantTake);

        const someoneElseCanTake = await DbIpAction.canTakeAction("registration", "192.168.0.4");
        chai.assert.isTrue(someoneElseCanTake);
    });
});
