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

    async testUnauthedRequest<T>(url: string, method: string, body?: any, headers?: { [key: string]: string }): Promise<ParsedProxyResponse<T>> {
        const resp = await cassava.testing.testRouter(this, cassava.testing.createTestProxyEvent(url, method, {
            body: body && JSON.stringify(body) || undefined,
            headers: headers
        }));

        return {
            statusCode: resp.statusCode,
            headers: resp.headers,
            bodyRaw: resp.body,
            body: (resp.body && JSON.parse(resp.body)) || resp.body
        };
    }

    async testPostLoginRequest<T>(loginResp: ParsedProxyResponse<any>, url: string, method: string, body?: any): Promise<ParsedProxyResponse<T>> {
        let cookie: string = "";
        const setCookies = loginResp.headers["Set-Cookie"].split(";");
        for (const setCookie of setCookies) {
            const keyValueMatcher = /([^=$]+)+=([^ ;]+)/.exec(setCookie);
            if (keyValueMatcher) {
                const key = keyValueMatcher[1];
                if (!/^(expires|max-age|secure|httponly|samesite)$/i.exec(key)) {
                    const value = keyValueMatcher[2];
                    if (cookie) {
                        cookie += "; ";
                    }
                    cookie += `${key}=${value}`;
                }
            }
        }

        const resp = await cassava.testing.testRouter(this, cassava.testing.createTestProxyEvent(url, method, {
            headers: {
                Cookie: cookie,
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

    async testTeamMateRequest<T>(url: string, method: string, body?: any): Promise<ParsedProxyResponse<T>> {
        const resp = await cassava.testing.testRouter(this, cassava.testing.createTestProxyEvent(url, method, {
            headers: {
                Cookie: defaultTestUser.teamMate.cookie,
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
