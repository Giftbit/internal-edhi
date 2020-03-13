import * as aws from "aws-sdk";
import * as dynameh from "dynameh";
import * as giftbitRoutes from "giftbit-cassava-routes";
import * as uuid from "uuid";
import {DbObject} from "./DbObject";
import {stripUserIdTestMode} from "../utils/userUtils";
import {dynamodb, objectDynameh} from "./dynamodb";

/**
 * A team or organization that hopefully pays us money to use the system.
 * Accounts own business data but Users make the changes.
 */
export interface DbAccount {

    accountId: string;

    name: string;

    /**
     * The maximum number of days a user can be inactive before their
     * account is locked.
     */
    maxInactiveDays?: number;

    /**
     * The maximum age (in days) of a password that can be used to log in to this Account.
     * Setting this value is *not* recommended but is required anyways by some
     * IT departments.
     */
    maxPasswordAge?: number;

    /**
     * Whether MFA is required to gain access to this Account.
     */
    requireMfa?: boolean;

}

export namespace DbAccount {

    export function fromDbObject(o: DbObject): DbAccount {
        if (!o) {
            return null;
        }
        const accountDetails = {...o};
        delete accountDetails.pk;
        delete accountDetails.sk;
        return accountDetails as any;
    }

    export function toDbObject(accountDetails: DbAccount): DbAccount & DbObject {
        if (!accountDetails) {
            return null;
        }
        return {
            ...accountDetails,
            ...getKeys(accountDetails)
        };
    }

    export function getKeys(accountDetails: DbAccount): DbObject {
        return {
            pk: "Account/" + accountDetails.accountId,
            sk: "Account/" + accountDetails.accountId
        };
    }

    export async function get(accountId: string): Promise<DbAccount> {
        accountId = stripUserIdTestMode(accountId);
        return fromDbObject(await DbObject.get("Account/" + accountId, "Account/" + accountId));
    }

    export async function getMany(accountIds: string[]): Promise<DbAccount[]> {
        const dbObjects = await DbObject.getMany(accountIds.map(stripUserIdTestMode).map(accountId => ["Account/" + accountId, "Account/" + accountId]));
        return dbObjects.map(fromDbObject);
    }

    export async function getByAuth(auth: giftbitRoutes.jwtauth.AuthorizationBadge): Promise<DbAccount> {
        auth.requireIds("userId");
        const account = await get(stripUserIdTestMode(auth.userId));
        if (!account) {
            throw new Error(`Could not find authed AccountDetails ${auth.userId}`);
        }
        return account;
    }

    export async function put(account: DbAccount): Promise<void> {
        const req = buildPutInput(account);
        await dynamodb.putItem(req).promise();
    }

    export function buildPutInput(account: DbAccount): aws.DynamoDB.PutItemInput {
        const req = objectDynameh.requestBuilder.buildPutInput(toDbObject(account));
        objectDynameh.requestBuilder.addCondition(req, {
            attribute: "pk",
            operator: "attribute_not_exists"
        });
        return req;
    }

    export async function update(account: DbAccount, ...actions: dynameh.UpdateExpressionAction[]): Promise<void> {
        const req = buildUpdateInput(account, ...actions);
        await dynamodb.updateItem(req).promise();
    }

    export function buildUpdateInput(account: DbAccount, ...actions: dynameh.UpdateExpressionAction[]): aws.DynamoDB.UpdateItemInput {
        const req = objectDynameh.requestBuilder.buildUpdateInputFromActions(DbAccount.getKeys(account), ...actions);
        objectDynameh.requestBuilder.addCondition(req, {
            attribute: "pk",
            operator: "attribute_exists"
        });
        return req;
    }

    export function generateAccountId(): string {
        // Accounts were the original users and this is how IDs were generated.
        // They still take this form for consistency.
        return "user-" + uuid.v4().replace(/-/g, "");
    }
}
