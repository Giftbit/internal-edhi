# internal-edhi
Edhi takes care of users

## Architecture

Edhi is back by a single DynamoDB table following [single table design](https://www.alexdebrie.com/posts/dynamodb-single-table/).  The `src/db/` directory outlines all the types of objects that can be stored in the table.  Each object has a `getKeys()` function describing how the `pk` and `sk` (and possibly `pk2` and `sk2`) keys are constructed.

Api keys are blocklisted by adding them to a WAF WebACL set up elsewhere.  First they're marked as deleted in the database; then an SQS queue item is created to indicate that the blocklist needs to be rebuilt; that queue triggers a Lambda function that finds all deleted API keys in the database and rebuilds the blocklist.
