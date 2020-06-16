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

    describe("limitedActions", () => {
        it("tracks added limited actions, throttles the action, and cleans up outdated", async () => {
            let user = await DbUser.get(testUtils.defaultTestUser.email);
            chai.assert.equal(DbUser.limitedActions.countAll(user, "failedLogin"), 0);

            for (let i = 0; i < 3; i++) {
                await DbUser.limitedActions.add(user, "failedLogin");
            }
            user = await DbUser.get(testUtils.defaultTestUser.email);
            chai.assert.equal(DbUser.limitedActions.countAll(user, "failedLogin"), 3);
            chai.assert.isFalse(DbUser.limitedActions.isThrottled(user, "failedLogin"));

            for (let i = 0; i < 7; i++) {
                await DbUser.limitedActions.add(user, "failedLogin");
            }
            user = await DbUser.get(testUtils.defaultTestUser.email);
            chai.assert.equal(DbUser.limitedActions.countAll(user, "failedLogin"), 10);
            chai.assert.isTrue(DbUser.limitedActions.isThrottled(user, "failedLogin"));

            // Manually push back three limited actions by 2 days
            const threeLimitedActions = Array.from(user.limitedActions["failedLogin"]);
            threeLimitedActions.length = 3;
            for (const d of threeLimitedActions) {
                const dOlder = new Date(d);
                dOlder.setDate(dOlder.getDate() - 2);
                user.limitedActions["failedLogin"].delete(d);
                user.limitedActions["failedLogin"].add(dOlder.toISOString());
            }
            await DbUser.update(user, {
                action: "put",
                attribute: "limitedActions",
                value: user.limitedActions
            });

            // Clean up outdated actions.
            await DbUser.update(user, ...DbUser.limitedActions.buildClearOutdatedUpdateActions(user));

            // Refresh the user and now those outdated actions should be gone.
            user = await DbUser.get(testUtils.defaultTestUser.email);
            chai.assert.equal(DbUser.limitedActions.countAll(user, "failedLogin"), 7);
            chai.assert.isFalse(DbUser.limitedActions.isThrottled(user, "failedLogin"));
        })
    });
});
