Stuff I'm in the middle of thinking about while my comp dies

TODO:
- user service
- segmentation and tagging
    - REST API
        - Value tags
            - ValueTag DTO
                - { id: string, name: string, color: string }
            - Value DTO
                - add { tagIds: string[] }
            - GET /transactions by contacts's tagId
            - GET /valueTags
            - POST /valueTags
            - GET /valueTags/{id}
            - PATCH /valueTags/{id}
            - DELETE /valueTags/{id}
                - propagate delete to all Values
            - GET /values and /value/{id} return tagIds
            - POST /values set tagIds
            - PATCH /value/{id} change tagIds
            - GET /transactions by value's tagId
        - Contact tags
            - ContactTag DTO
                - { id: string, name: string, color: string }
            - Contact DTO
                - add { tagIds: string[] }
            - GET /contactTags
            - POST /contactTags
            - GET /contactTags/{id}
            - PATCH /contactTags/{id}
            - DELETE /contactTags/{id}
                - propagate delete to all Contacts
            - GET /contacts and /contacts/{id} return tagIds
            - POST /contacts set tagIds
            - PATCH /contacts/{id} change tagIds
    - tag automaitcally created when a program is created
        - tag automatically applied to Values created from a Program
        ? link to the tag from the Program
        ? does this muddy the water about what what a tag is and how it's different from a Program
        ? tag an issuance as well
            ? does an issuance still exist
    - migration
        - create tagId for every programId
        - tag every value with its programId
        - delete programId from Value
    - rejected ideas
        - nomenclature
            - tag
                - AWS resources
                - many image tagging sites
            - label
                - github issue
                - trello card
        - tags as separate endpoint off /values
            - GET /values/{id}/tags  []
            - PATCH /values/{id}/tags []
            - unnecessary extra calls for front end
        - tag hierarchy?
            - not seeing this in other APIs
        - enforce limit for implementation reasons
            - no need
            - Even DynamoDB would likely normalize this into another table.
        - label as simple string only
            - no renaming or it's super expensive
- pet projects
    - dynameh transaction support
        - https://aws.amazon.com/blogs/aws/new-amazon-dynamodb-transactions/
    - Aurora Serverless Data API driver for knex.js
        - currently has performance issues
    - improve Cassava documentation
        - suggest Cassava to https://snarkive.lastweekinaws.com/


Figuring out the services password encoding

password:
$2a$10$1A7dIgsPiB.Xf0kaHbVggOiI75vF8nU26MdDb6teeKq0B.AqaXLsy

configured algorithm:
PBEWITHSHA256AND256BITAES-CBC-BC

I'm not sure how this is assembled.  I'm going to try reading the source from http://svn.code.sf.net/p/jasypt/code/tags/jasypt/jasypt-1.9.2/ particularly org.jasypt.encryption.pbe.StandardPBEStringEncryptor .  I think the above is a weird base64 encoding and then the bytes are explained in http://www.jasypt.org/encrypting-passwords.html .

Some related node code:

var crypto = require('crypto');
var hash = crypto.createHmac('sha256', 'blahBlahwno9L2utI6OfOxSEPiOkZopukCF8DINL');
hash.update('password');

var iv = crypto.randomBytes(16);
var cipher = crypto.createCipheriv('aes-256-cbc', 'blahBlahwno9L2utI6OfOxSEPiOkZopukCF8DINL', );
cipher.update(hash.digest());
