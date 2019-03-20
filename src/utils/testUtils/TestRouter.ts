import * as cassava from "cassava";

export interface ParsedProxyResponse<T> {
    statusCode: number;
    headers: {
        [key: string]: string;
    };
    body: T;
}

export class TestRouter extends cassava.Router {

    async testRequest<T>(url: string, method: string, body?: any): Promise<ParsedProxyResponse<T>> {
        const resp = await cassava.testing.testRouter(this, cassava.testing.createTestProxyEvent(url, method, {
            body: body && JSON.stringify(body) || undefined
        }));

        return {
            statusCode: resp.statusCode,
            headers: resp.headers,
            body: resp.body && JSON.parse(resp.body) || undefined
        };
    }
}
