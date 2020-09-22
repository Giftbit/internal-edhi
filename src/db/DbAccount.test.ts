import * as chai from "chai";
import * as testUtils from "../utils/testUtils";
import {DbAccount} from "./DbAccount";
import {createdDateNow} from "./dynamodb";

describe("DbAccount", () => {

    before(async () => {
        await testUtils.resetDb();
    });

    it("returns the original object in fromDbObject(toDbObject())", () => {
        const original: DbAccount = {
            accountId: testUtils.generateId(),
            name: testUtils.generateId(),
            createdDate: createdDateNow()
        };
        const returned = DbAccount.fromDbObject(DbAccount.toDbObject(original));
        chai.assert.deepEqual(returned, original);
    });

    it("can put and get an Account", async () => {
        const account: DbAccount = {
            accountId: testUtils.generateId(),
            name: testUtils.generateId(),
            createdDate: createdDateNow()
        };

        await DbAccount.put(account);
        const retrievedAccount = await DbAccount.get(account.accountId);

        chai.assert.deepEqual(retrievedAccount, account);
    });

    it("can partially update an Account", async () => {
        const account: DbAccount = {
            accountId: testUtils.generateId(),
            name: testUtils.generateId(),
            createdDate: createdDateNow()
        };
        await DbAccount.put(account);

        const newName = testUtils.generateId();
        await DbAccount.update(account, {action: "put", attribute: "name", value: newName});

        const retrievedAccount = await DbAccount.get(account.accountId);
        chai.assert.equal(retrievedAccount.name, newName);
    });

});
