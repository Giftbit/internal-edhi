import * as chai from "chai";
import * as testUtils from "../../utils/testUtils";
import {DbUser} from "../../db/DbUser";
import {DbApiKey} from "../../db/DbApiKey";
import {createdDateNow} from "../../db/dynamodb";
import {DbDeletedApiKey} from "../../db/DbDeletedApiKey";
import {buildBlockApiKeyStatement} from "./rebuildApiKeyBlocklist";
import chaiExclude from "chai-exclude";
import chaiString = require("chai-string");

chai.use(chaiExclude);
chai.use(chaiString);

describe("rebuildApiKeyBlocklist", () => {

    before(async () => {
        await testUtils.resetDb();
        DbUser.initializeBadgeSigningSecrets(Promise.resolve({secretkey: "secret"}));
    });

    describe("buildBlockApiKeyStatement", () => {
        it("builds a statement that blocks an API key based upon its signature", async () => {
            const apiKey: DbApiKey = {
                accountId: testUtils.generateId(),
                userId: testUtils.generateId(),
                name: "Test Key",
                tokenId: DbApiKey.generateTokenId(),
                tokenVersion: 3,
                roles: ["a"],
                scopes: ["b"],
                createdDate: createdDateNow()
            };
            const badge = DbApiKey.getBadge(apiKey);
            const token = await DbUser.getBadgeApiToken(badge);

            const deletedApiKey = DbDeletedApiKey.fromDbApiKey(apiKey);
            const statement = await buildBlockApiKeyStatement(deletedApiKey);
            chai.assert.isObject(statement.ByteMatchStatement, "is ByteMatchStatement");
            chai.assert.deepEqualExcluding(
                statement.ByteMatchStatement,
                {
                    SearchString: "",
                    FieldToMatch: {
                        SingleHeader: {
                            Name: "authorization"
                        }
                    },
                    TextTransformations: [
                        {
                            Priority: 0,
                            Type: "NONE"
                        }
                    ],
                    PositionalConstraint: "ENDS_WITH"
                },
                ["SearchString"]
            );

            chai.assert.endsWith(token, statement.ByteMatchStatement.SearchString as string, "the decoded search string is the end of the token");
        });

        it("builds a statement that blocks an API key created in 2020-06", async () => {
            const apiKey: DbApiKey = {
                accountId: "64f3611d-e4ee-49df-9",
                userId: "2a1310f5-6ff0-437b-a",
                name: "Test Key",
                tokenId: "tok-943c5f2dfe92412a8e14aad111d0f5ee",
                tokenVersion: 3,
                roles: ["a"],
                scopes: ["b"],
                createdDate: "2020-06-25T17:10:17.076Z"
            };
            const deletedApiKey = DbDeletedApiKey.fromDbApiKey(apiKey);
            const statement = await buildBlockApiKeyStatement(deletedApiKey);
            chai.assert.deepEqual(
                statement.ByteMatchStatement,
                {
                    // Must be this signature.  Never change it.
                    SearchString: ".KPwyR8xlitBx4FgSEjtyUTtoHappBd7MDq9KizNCYro",
                    FieldToMatch: {
                        SingleHeader: {
                            Name: "authorization"
                        }
                    },
                    TextTransformations: [
                        {
                            Priority: 0,
                            Type: "NONE"
                        }
                    ],
                    PositionalConstraint: "ENDS_WITH"
                }
            );
        });
    });
});
