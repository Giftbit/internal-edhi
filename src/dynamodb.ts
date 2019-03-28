import * as aws from "aws-sdk";
import * as dynameh from "dynameh";

export const dynamodb = new aws.DynamoDB({
    apiVersion: "2012-08-10",
    credentials: new aws.EnvironmentCredentials("AWS"),
    endpoint: process.env["TEST_ENV"] == "true" ? "http://localhost:8000" : undefined,
    region: process.env["AWS_REGION"]
});

export function dateCreatedNow(): string {
    return new Date().toISOString();
}

export const teamMemberSchema: dynameh.TableSchema = {
    tableName: process.env["TEAM_MEMBER_TABLE"],
    partitionKeyField: "userId",
    partitionKeyType: "string",
    sortKeyField: "teamMemberId",
    sortKeyType: "string"
};

export const teamMemberByTeamMemberIdSchema: dynameh.TableSchema = {
    tableName: teamMemberSchema.tableName,
    indexName: "ByTeamMemberId",
    indexProperties: {
        type: "GLOBAL",
        projectionType: "ALL"
    },
    partitionKeyField: "teamMemberId",
    partitionKeyType: "string",
    sortKeyField: "userId",
    sortKeyType: "string"
};

export const tokenActionSchema: dynameh.TableSchema = {
    tableName: process.env["TOKEN_ACTION_TABLE"],
    partitionKeyField: "token",
    partitionKeyType: "string",
    ttlField: "ttl"
};

export const userSchema: dynameh.TableSchema = {
    tableName: process.env["USER_TABLE"],
    partitionKeyField: "email",
    partitionKeyType: "string"
};

export const userByUserIdSchema: dynameh.TableSchema = {
    tableName: userSchema.tableName,
    indexName: "ByUserId",
    indexProperties: {
        type: "GLOBAL",
        projectionType: "ALL"
    },
    partitionKeyField: "userId",
    partitionKeyType: "string"
};

export const teamMemberDynameh = dynameh.scope(teamMemberSchema);
export const teamMemberByTeamMemberIdDynameh = dynameh.scope(teamMemberByTeamMemberIdSchema);
export const tokenActionDynameh = dynameh.scope(tokenActionSchema);
export const userDynameh = dynameh.scope(userSchema);
export const userByUserIdDynameh = dynameh.scope(userByUserIdSchema);
