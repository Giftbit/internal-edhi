import {TokenAction} from "../model/TokenAction";
import {dynamodb, tokenActionDynameh} from "../dynamodb";

export async function getTokenAction(token: string): Promise<TokenAction> {
    const req = tokenActionDynameh.requestBuilder.buildGetInput(token);
    const resp = await dynamodb.getItem(req).promise();
    return tokenActionDynameh.responseUnwrapper.unwrapGetOutput(resp);
}

export async function putTokenAction(tokenAction: TokenAction): Promise<void> {
    const req = tokenActionDynameh.requestBuilder.buildPutInput(tokenAction);
    await dynamodb.putItem(req).promise();
}

export async function deleteTokenAction(tokenAction: TokenAction): Promise<void> {
    const req = tokenActionDynameh.requestBuilder.buildDeleteInput(tokenAction);
    await dynamodb.deleteItem(req).promise();
}
