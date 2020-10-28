# internal-edhi
Edhi takes care of users

## Architecture

Edhi is back by a single DynamoDB table following [single table design](https://www.alexdebrie.com/posts/dynamodb-single-table/).  The `src/db/` directory outlines all the types of objects that can be stored in the table.  Each object has a `getKeys()` function describing how the `pk` and `sk` (and possibly `pk2` and `sk2`) keys are constructed.

Api keys are blocklisted by adding them to a WAF WebACL set up elsewhere.  First they're marked as deleted in the database; then an SQS queue item is created to indicate that the blocklist needs to be rebuilt; that queue triggers a Lambda function that finds all deleted API keys in the database and rebuilds the blocklist.

## Scripts

All of these scripts assume access to the database is restricted to a role (probably InfrastructureAdmin) and that MFA is required.  If you don't have MFA enabled or access to the database isn't restricted to a role you have done bad things and you should feel bad.

### Export database

You can export the entire database to a single JSON file with the command `./node_modules/.bin/ts-node scripts/export.ts`.
