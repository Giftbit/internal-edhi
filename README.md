# internal-edhi
Edhi takes care of users

## Architecture

Edhi is back by a single DynamoDB table following [single table design](https://www.alexdebrie.com/posts/dynamodb-single-table/).  The `src/db/` directory outlines all the types of objects that can be stored in the table.  Each object has a `getKeys()` function describing how the `pk` and `sk` (and possibly `pk2` and `sk2`) keys are constructed.

API keys are blocklisted by adding them to a WAF WebACL set up elsewhere.  First they're marked as deleted in the database; then an SQS queue item is created to indicate that the blocklist needs to be rebuilt; that queue triggers a Lambda function that finds all deleted API keys in the database and rebuilds the blocklist.  The WAF WebACL can only block about 700 API keys.  The plan once that was at risk of getting full was to rotate keys out of that and into a Lambda@Edge function for additional key blocking capacity.

## Scripts

All of these scripts assume access to the database is restricted to a role (probably InfrastructureAdmin) and that MFA is required.  If you don't have MFA enabled or access to the database isn't restricted to a role you have done bad things and you should feel bad.

The scripts do have some debug logging.  You can enable this by setting the `DEBUG` enviornment variable to `true` eg: `DEBUG=true ./node_modules/.bin/ts-node scripts/findAccountId.ts`

### Find accoundId

`./node_modules/.bin/ts-node scripts/findAccountId.ts`

Search through Accounts and AccountUser email addresses for the given string.  The search is case sensitive, so if you're searching for a company name like "FooBar" you might also try "foobar."

You may find multiple Accounts if developers from the company set up testing development accounts.  This is not unusual.

### Export database

`./node_modules/.bin/ts-node scripts/export.ts`

Export the entire database to a single JSON file with the command .  This should only be done as part of turning off Lightrail for good.
