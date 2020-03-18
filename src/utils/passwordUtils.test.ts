import * as chai from "chai";
import {hashPassword, validatePassword} from "./passwordUtils";

describe("passwordUtils", () => {
    it("validates an existing v1 password (even if it is weak)", async () => {
        const res = await validatePassword("password", {
            algorithm: "BCRYPT",
            hash: "$2a$10$1A7dIgsPiB.Xf0kaHbVggOiI75vF8nU26MdDb6teeKq0B.AqaXLsy",
            createdDate: "2019-03-19T23:43:25.886Z"
        });
        chai.assert.isTrue(res);
    });

    it("does not validate a wrong v1 password", async () => {
        const res = await validatePassword("pigglywiggly", {
            algorithm: "BCRYPT",
            hash: "$2a$10$1A7dIgsPiB.Xf0kaHbVggOiI75vF8nU26MdDb6teeKq0B.AqaXLsy",
            createdDate: "2019-03-19T23:43:25.886Z"
        });
        chai.assert.isFalse(res);
    });

    it("salts to generate unique hashes", async () => {
        const password = "mysharona1979";

        const userPassword1 = await hashPassword(password);
        const validate1 = await validatePassword(password, userPassword1);
        chai.assert.isTrue(validate1);

        const userPassword2 = await hashPassword(password);
        const validate2 = await validatePassword(password, userPassword2);
        chai.assert.isTrue(validate2);

        chai.assert.notEqual(userPassword1.hash, userPassword2.hash);
    });

    it("does not hash short passwords", async () => {
        let err: any;
        try {
            await hashPassword("65sdf&");
        } catch (e) {
            err = e;
        }
        chai.assert.isDefined(err, "throws an error");
    });

    it("does not hash passwords of only numbers", async () => {
        let err: any;
        try {
            await hashPassword("123456543456");
        } catch (e) {
            err = e;
        }
        chai.assert.isDefined(err, "throws an error");
    });

    it("does not hash common passwords", async () => {
        let err: any;
        try {
            await hashPassword("basketball");
        } catch (e) {
            err = e;
        }
        chai.assert.isDefined(err, "throws an error");
    });
});
