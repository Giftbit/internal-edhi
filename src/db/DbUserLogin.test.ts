import * as chai from "chai";
import * as testUtils from "../utils/testUtils";
import {DbUserLogin} from "./DbUserLogin";
import {createdDateNow} from "./dynamodb";

describe("DbUserLogin", () => {

    before(async () => {
        await testUtils.resetDb();
    });

    it("returns the original object in fromDbObject(toDbObject())", () => {
        const original: DbUserLogin = {
            email: `${testUtils.generateId()}@example.com`,
            userId: testUtils.generateId(),
            emailVerified: true,
            frozen: false,
            defaultLoginAccountId: testUtils.generateId(),
            createdDate: createdDateNow()
        };
        const returned = DbUserLogin.fromDbObject(DbUserLogin.toDbObject(original));
        chai.assert.deepEqual(returned, original);
    });

    it("can put and get a UserLogin", async () => {
        const userLogin: DbUserLogin = {
            email: `${testUtils.generateId()}@example.com`,
            userId: testUtils.generateId(),
            emailVerified: true,
            frozen: false,
            defaultLoginAccountId: testUtils.generateId(),
            createdDate: createdDateNow()
        };
        await DbUserLogin.put(userLogin);

        const userLoginByEmail = await DbUserLogin.get(userLogin.email);
        chai.assert.deepEqual(userLoginByEmail, userLogin);

        const userLoginById = await DbUserLogin.getById(userLogin.userId);
        chai.assert.deepEqual(userLoginById, userLogin);
    });

    it("can partially update a UserLogin", async () => {
        const userLogin: DbUserLogin = {
            email: `${testUtils.generateId()}@example.com`,
            userId: testUtils.generateId(),
            emailVerified: true,
            frozen: false,
            defaultLoginAccountId: testUtils.generateId(),
            createdDate: createdDateNow()
        };
        await DbUserLogin.put(userLogin);

        await DbUserLogin.update(userLogin, {action: "put", attribute: "frozen", value: true});
        const frozenUserLogin = await DbUserLogin.get(userLogin.email);
        chai.assert.isTrue(frozenUserLogin.frozen);
    });
});
