# internal-edhi
Edhi takes care of users

## Architecture

Edhi's architecture is defined in the [AWS SAM template](https://docs.aws.amazon.com/serverless-application-model/latest/developerguide/sam-specification-template-anatomy.html) file `infrastructure/sam.yaml`.

Edhi is back by a single DynamoDB table following [single table design](https://www.alexdebrie.com/posts/dynamodb-single-table/).  The `src/db/` directory outlines all the types of objects that can be stored in the table.  Each object has a `getKeys()` function describing how the `pk` and `sk` (and possibly `pk2` and `sk2`) keys are constructed.

A User can belong to 0 or more Accounts.  An Account can have 1 or more Users.  Users cannot remove themselves from an Account to prevent the Account from being unmanageable.  The join between Accounts to Users is the AccountUser object.

API keys are blocklisted by adding them to a WAF WebACL set up elsewhere.  First they're marked as deleted in the database; then an SQS queue item is created to indicate that the blocklist needs to be rebuilt; that queue triggers a Lambda function that finds all deleted API keys in the database and rebuilds the blocklist.  The WAF WebACL can only block about 700 API keys.  The plan (once that was at risk of getting full) was to rotate keys out of that and into a Lambda@Edge function for additional key blocking capacity.

## Development

You'll need Node (tested with 10.16), Docker and aws-cli.  Install dependencies with `npm i`.

Run the unit tests with `npm run test`.  Run the linter with `npm run lint`.  I guess it doesn't really matter if you track mud on the carpet when the house is about to be town down anyways, but still, it feels rude.

Deploy to dev with `./dev.sh deploy`.  There are other commands in that script but you don't really need them.  Deploy to staging by committing to the staging branch and approving the CodePipeline in the staging AWS account.  When the staging deployment completes a PR from staging to master will be opened automatically.  Deploy to production by merging that PR and approving the CodePipeline in the production account.

## Scripts

All of these scripts assume access to the database is restricted to a role (probably InfrastructureAdmin) and that MFA is required.  If you don't have MFA enabled or access to the database isn't restricted to a role you have done bad things and you should feel bad.

The scripts do have some debug logging.  You can enable this by setting the `DEBUG` enviornment variable to `true` eg: `DEBUG=true ./node_modules/.bin/ts-node scripts/findAccountId.ts`

### Find accoundId

`./node_modules/.bin/ts-node scripts/findAccountId.ts`

Search through Account names and AccountUser email addresses for the given string.  The search is case-sensitive, so if you're searching for a company name like "FooBar" you might also try "foobar."

You may find multiple Accounts if developers from the company set up testing development accounts.  This is not unusual.

### Freeze and unfreeze Account

`./node_modules/.bin/ts-node scripts/freezeAccount.ts`

`./node_modules/.bin/ts-node scripts/unfreezeAccount.ts`

Freeze and unfreeze an Account by accountId.  Freezing is how we revoke/disable/delete an account.  As indicated this operation is easily reversible.

This does not delete their API keys.  I think it's a good idea to *not* delete their API keys just in case communication gets confused and the customer is not actually done using Lightrail yet.

### Delete API keys

`./node_modules/.bin/ts-node scripts/deleteAccountApiKeys.ts`

Deletes all live and test mode API keys for the given accountId.  This is not as easily reversed as freezing the Account so I don't generally recommend this.  I would only go this route if someone was being abusive.

### Export database

`./node_modules/.bin/ts-node scripts/export.ts`

Export the entire database to a single JSON file with the command .  This should only be done as part of turning off Lightrail for good.
