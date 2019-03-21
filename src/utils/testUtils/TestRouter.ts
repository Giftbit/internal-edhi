import * as cassava from "cassava";
import {defaultTestUser} from "./index";

export interface ParsedProxyResponse<T> {
    statusCode: number;
    headers: {
        [key: string]: string;
    };
    bodyRaw: string;
    body: T;
}

export class TestRouter extends cassava.Router {

    async testUnauthedRequest<T>(url: string, method: string, body?: any): Promise<ParsedProxyResponse<T>> {
        const resp = await cassava.testing.testRouter(this, cassava.testing.createTestProxyEvent(url, method, {
            body: body && JSON.stringify(body) || undefined
        }));

        return {
            statusCode: resp.statusCode,
            headers: resp.headers,
            bodyRaw: resp.body,
            body: resp.body && JSON.parse(resp.body) || undefined
        };
    }

    async testApiRequest<T>(url: string, method: string, body?: any): Promise<ParsedProxyResponse<T>> {
        const resp = await cassava.testing.testRouter(this, cassava.testing.createTestProxyEvent(url, method, {
            headers: {
                Authorization: `Bearer ${defaultTestUser.jwt}`
            },
            body: body && JSON.stringify(body) || undefined
        }));

        return {
            statusCode: resp.statusCode,
            headers: resp.headers,
            bodyRaw: resp.body,
            body: resp.body && JSON.parse(resp.body) || undefined
        };
    }

    async testWebAppRequest<T>(url: string, method: string, body?: any): Promise<ParsedProxyResponse<T>> {
        const resp = await cassava.testing.testRouter(this, cassava.testing.createTestProxyEvent(url, method, {
            headers: {
                Cookie: defaultTestUser.cookie,
                "X-Requested-With": "XMLHttpRequest"
            },
            body: body && JSON.stringify(body) || undefined
        }));

        return {
            statusCode: resp.statusCode,
            headers: resp.headers,
            bodyRaw: resp.body,
            body: resp.body && JSON.parse(resp.body) || undefined
        };
    }
}
