import * as aws from "aws-sdk";

let sqs: aws.SQS;

/**
 * Sending a message over SQS is actually really easy, but separating
 * it out makes it easier to mock in SinonJS.
 */
export async function sendSqsMessage(queueUrl: string, message: any): Promise<void> {
    if (!queueUrl) {
        throw new Error("queueUrl undefined");
    }

    if (!sqs) {
        sqs = new aws.SQS({
            apiVersion: "2012-11-05",
            credentials: new aws.EnvironmentCredentials("AWS"),
            region: process.env["AWS_REGION"]
        });
    }

    await sqs.sendMessage({
        QueueUrl: queueUrl,
        MessageBody: JSON.stringify(message)
    }).promise();
}
