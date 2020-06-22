import * as aws from "aws-sdk";
import {DbApiKey} from "../../../db/DbApiKey";

export async function blocklistApiKey(apiKey: DbApiKey): Promise<void> {
    const waf = new aws.WAFV2({
        apiVersion: "2019-07-29",
        credentials: new aws.EnvironmentCredentials("AWS"),
        region: "us-east-1"
    });
    

}
