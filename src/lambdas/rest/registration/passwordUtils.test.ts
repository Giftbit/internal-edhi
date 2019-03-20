import * as chai from "chai";
import {hashPassword, validatePassword} from "./passwordUtils";

describe("passwordUtils", () => {
    it("validates an existing v1 password", async () => {
        const res = await validatePassword("password", {
            algorithm: "BCRYPT",
            hash: "$2a$10$1A7dIgsPiB.Xf0kaHbVggOiI75vF8nU26MdDb6teeKq0B.AqaXLsy",
            dateCreated: "2019-03-19T23:43:25.886Z"
        });
        chai.assert.isTrue(res);
    });

    it("does not validate a wrong v1 password", async () => {
        const res = await validatePassword("pigglywiggly", {
            algorithm: "BCRYPT",
            hash: "$2a$10$1A7dIgsPiB.Xf0kaHbVggOiI75vF8nU26MdDb6teeKq0B.AqaXLsy",
            dateCreated: "2019-03-19T23:43:25.886Z"
        });
        chai.assert.isFalse(res);
    });

    it("salts to generate unique hashes", async () => {
        const userPassword1 = await hashPassword("mysharona");
        const validate1 = await validatePassword("mysharona", userPassword1);
        chai.assert.isTrue(validate1);

        const userPassword2 = await hashPassword("mysharona");
        const validate2 = await validatePassword("mysharona", userPassword2);
        chai.assert.isTrue(validate2);

        chai.assert.notEqual(userPassword1.hash, userPassword2.hash);
    });
});
