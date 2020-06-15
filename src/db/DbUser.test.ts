import * as chai from "chai";
import * as testUtils from "../utils/testUtils";
import {DbUser} from "./DbUser";
import {createdDateNow} from "./dynamodb";

describe("DbUser", () => {

    before(async () => {
        await testUtils.resetDb();
    });

    it("returns the original object in fromDbObject(toDbObject())", () => {
        const original: DbUser = {
            email: testUtils.generateValidEmailAddress(),
            userId: testUtils.generateId(),
            login: {
                emailVerified: true,
                frozen: false,
                defaultLoginAccountId: testUtils.generateId()
            },
            limitedActions: {},
            createdDate: createdDateNow()
        };
        const returned = DbUser.fromDbObject(DbUser.toDbObject(original));
        chai.assert.deepEqual(returned, original);
    });

    it("can put and get a User", async () => {
        const user: DbUser = {
            email: testUtils.generateValidEmailAddress(),
            userId: testUtils.generateId(),
            login: {
                emailVerified: true,
                frozen: false,
                defaultLoginAccountId: testUtils.generateId()
            },
            limitedActions: {},
            createdDate: createdDateNow()
        };
        await DbUser.put(user);

        const userByEmail = await DbUser.get(user.email);
        chai.assert.deepEqual(userByEmail, user);

        const userById = await DbUser.getById(user.userId);
        chai.assert.deepEqual(userById, user);
    });

    it("can partially update a User", async () => {
        const user: DbUser = {
            email: testUtils.generateValidEmailAddress(),
            userId: testUtils.generateId(),
            login: {
                emailVerified: true,
                frozen: false,
                defaultLoginAccountId: testUtils.generateId()
            },
            limitedActions: {},
            createdDate: createdDateNow()
        };
        await DbUser.put(user);

        await DbUser.update(user, {action: "put", attribute: "login.frozen", value: true});
        const frozenUser = await DbUser.get(user.email);
        chai.assert.isTrue(frozenUser.login.frozen);
    });
});
