import * as aws from "aws-sdk";
import * as giftbitRoutes from "giftbit-cassava-routes";
import {DbApiKey} from "../../db/DbApiKey";
import {DbUser} from "../../db/DbUser";
import {DbDeletedApiKey} from "../../db/DbDeletedApiKey";
import log = require("loglevel");

const apiKeyBlocklistRuleName = "ApiKeyBlocklist";

export async function rebuildApiKeyBlocklist(): Promise<void> {
    log.info("Rebuilding API key blocklist...");

    const waf = new aws.WAFV2({
        apiVersion: "2019-07-29",
        credentials: new aws.EnvironmentCredentials("AWS"),
        region: "us-east-1"
    });

    log.info("Fetching current WAF config...");
    const webAclDetails = getWebAclDetails(process.env["WEB_ACL_ARN"]);
    const getWebAclResp = await waf.getWebACL({
        Id: webAclDetails.id,
        Name: webAclDetails.name,
        Scope: "CLOUDFRONT"
    }).promise();

    const updateReq = await buildUpdateWebAclRequest(getWebAclResp.WebACL, getWebAclResp.LockToken);
    log.debug("update WAF request", updateReq);

    log.info("Sending WAF update...");
    const updateResp = await waf.updateWebACL(updateReq).promise();
    log.debug("update WAF response", updateResp);
}

function getWebAclDetails(webAclArn: string): { id: string, name: string } {
    if (!webAclArn) {
        throw new Error("webAclArn undefined");
    }
    const parts = /^arn:aws:wafv2:us-east-1:\d+:global\/webacl\/([^/]+)\/([0-9a-f-]+)$/.exec(webAclArn);
    return {
        id: parts[2],
        name: parts[1]
    };
}

/**
 * Build the request to update the WAF WebACL to block deleted ApiKeys.
 */
async function buildUpdateWebAclRequest(webAcl: aws.WAFV2.WebACL, lockToken: string): Promise<aws.WAFV2.UpdateWebACLRequest> {
    const update: aws.WAFV2.UpdateWebACLRequest = {
        DefaultAction: webAcl.DefaultAction,
        Id: webAcl.Id,
        LockToken: lockToken,
        Name: webAcl.Name,
        Scope: "CLOUDFRONT",
        VisibilityConfig: webAcl.VisibilityConfig,
        Rules: webAcl.Rules.filter(rule => rule.Name !== apiKeyBlocklistRuleName)
    };

    const existingBlocklistRule = webAcl.Rules.find(rule => rule.Name === apiKeyBlocklistRuleName);

    const deletedApiKeys = await DbDeletedApiKey.getAll();
    log.info("Building blocklist rule for", deletedApiKeys.length, "deleted api keys");
    if (deletedApiKeys.length % 100 === 0) {
        giftbitRoutes.sentry.sendErrorNotification(new Error(`Building API key blocklist for ${deletedApiKeys.length} deleted API keys.  This is not necessarily an error.  Only 747 API keys can be blocklisted using the WebACL.  After that keys need to be rotated into another mechanism to blocklist them.  This is something we will have to build before it gets there.`));
    }

    if (deletedApiKeys.length === 0) {
        throw new Error("Found no deleted api keys to blocklist.  How did this get called?");
    } else if (deletedApiKeys.length === 1) {
        update.Rules.push({
            Name: apiKeyBlocklistRuleName,
            Action: existingBlocklistRule?.Action ?? {Block: {}},
            Priority: existingBlocklistRule?.Priority ?? update.Rules.length,
            Statement: await buildBlockApiKeyStatement(deletedApiKeys[0]),
            VisibilityConfig: existingBlocklistRule?.VisibilityConfig ?? {
                "SampledRequestsEnabled": true,
                "CloudWatchMetricsEnabled": true,
                "MetricName": "blocked_api_keys"
            }
        });
    } else {
        update.Rules.push({
            Name: apiKeyBlocklistRuleName,
            Action: existingBlocklistRule?.Action ?? {Block: {}},
            Priority: existingBlocklistRule?.Priority ?? update.Rules.length,
            Statement: {
                OrStatement: {
                    Statements: await Promise.all(deletedApiKeys.map(buildBlockApiKeyStatement))
                }
            },
            VisibilityConfig: existingBlocklistRule?.VisibilityConfig ?? {
                "SampledRequestsEnabled": true,
                "CloudWatchMetricsEnabled": true,
                "MetricName": "blocked_api_keys"
            }
        });
    }

    return update;
}

/**
 * Exported for testing only.
 * @private
 */
export async function buildBlockApiKeyStatement(apiKey: DbDeletedApiKey): Promise<aws.WAFV2.Statement> {
    const badge = DbApiKey.getBadge(apiKey);
    const apiToken = await DbUser.getBadgeApiToken(badge);

    if (apiKey.tokenHash) {
        const apiTokenHash = DbApiKey.getTokenHash(apiToken);
        if (apiTokenHash !== apiKey.tokenHash) {
            log.error("apiKey=", apiKey);
            throw new Error(`Generated an ApiKey token with a hash that does not match the expected hash!  The token we're trying to block does not match the one given to the user. tokenId=${apiKey.tokenId} expected token hash=${apiKey.tokenHash} actual token hash=${apiTokenHash}`);
        }
    }

    return {
        ByteMatchStatement: {
            SearchString: "." + apiToken.split(".", 3)[2],
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
    };
}
