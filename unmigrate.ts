import * as aws from "aws-sdk";
import * as dynemeh from "dynameh";

/**
 * Nukes the entire ObjectTable to allow migration to be run again.
 */

const dynamodb = new aws.DynamoDB({
    apiVersion: "2012-08-10",
    credentials: new aws.SharedIniFileCredentials(),
    region: "us-west-2"
});

async function main(): Promise<void> {
    console.log("finding table name");
    const tableRes = await dynamodb.listTables().promise();
    const edhiObjectTable = tableRes.TableNames.find(name => name.indexOf("-Edhi-ObjectTable-") !== -1);
    if (!edhiObjectTable) {
        throw new Error("Could not find ")
    }
    console.log("got table name");

    const objectSchema: dynemeh.TableSchema = {
        tableName: edhiObjectTable,
        partitionKeyField: "pk",
        partitionKeyType: "string",
        sortKeyField: "sk",
        sortKeyType: "string"
    };

    const scanInput = dynemeh.requestBuilder.buildScanInput(objectSchema);
    let deleteCount = 0;
    await dynemeh.scanHelper.scanByCallback(dynamodb, scanInput, async items => {
        try {
            for (const item of items) {
                const delInput = dynemeh.requestBuilder.buildDeleteInput(objectSchema, item);
                await dynamodb.deleteItem(delInput).promise();
                console.log("deleted", ++deleteCount, "items");
            }
        } catch (err) {
            console.error(err);
            return false;
        }
        return true;
    });
}

main().then(res => console.log("success", res)).catch(err => console.error("fail", err));
