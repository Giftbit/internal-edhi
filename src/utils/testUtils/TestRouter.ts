import * as cassava from "cassava";
import {defaultTestUser} from "./index";

export class ParsedProxyResponse<T> {
    statusCode: number;
    headers: {
        [key: string]: string;
    };
    multiValueHeaders: {
        [key: string]: string[];
    };
    bodyRaw: string;
    body: T;

    constructor(resp: cassava.ProxyResponse) {
        this.statusCode = resp.statusCode;
        this.headers = resp.headers;
        this.multiValueHeaders = resp.multiValueHeaders;
        this.bodyRaw = resp.body;
        this.body = (resp.body && JSON.parse(resp.body)) || resp.body;
    }

    getCookie(name: string): string | null {
        const key = name + "=";
        if (this.headers?.["Set-Cookie"]?.startsWith(key)) {
            return /[^=]+=([^;]+)/.exec(this.headers["Set-Cookie"])[1];
        }
        const multiValueHeaderCookie = this.multiValueHeaders?.["Set-Cookie"]?.find(s => s.startsWith(key));
        if (multiValueHeaderCookie) {
            return /[^=]+=([^;]+)/.exec(multiValueHeaderCookie)[1];
        }
        return null;
    }
}

export class TestRouter extends cassava.Router {

    async testUnauthedRequest<T>(url: string, method: string, body?: any, headers?: { [key: string]: string }): Promise<ParsedProxyResponse<T>> {
        const resp = await cassava.testing.testRouter(this, cassava.testing.createTestProxyEvent(url, method, {
            body: body && JSON.stringify(body) || undefined,
            headers: headers
        }));
        return new ParsedProxyResponse<T>(resp);
    }

    async testPostLoginRequest<T>(loginResp: ParsedProxyResponse<any>, url: string, method: string, body?: any): Promise<ParsedProxyResponse<T>> {
        let cookie = "";
        if (loginResp.multiValueHeaders?.["Set-Cookie"]) {
            cookie = loginResp.multiValueHeaders["Set-Cookie"].map(c => c.split(";")[0]).join("; ");
        } else if (loginResp.headers?.["Set-Cookie"]) {
            cookie = loginResp.headers["Set-Cookie"].split(";")[0];
        }

        const resp = await cassava.testing.testRouter(this, cassava.testing.createTestProxyEvent(url, method, {
            headers: {
                Cookie: cookie,
                "X-Requested-With": "XMLHttpRequest"
            },
            body: body && JSON.stringify(body) || undefined
        }));
        return new ParsedProxyResponse<T>(resp);
    }

    async testApiRequest<T>(url: string, method: string, body?: any): Promise<ParsedProxyResponse<T>> {
        const resp = await cassava.testing.testRouter(this, cassava.testing.createTestProxyEvent(url, method, {
            headers: {
                Authorization: `Bearer ${defaultTestUser.jwt}`
            },
            body: body && JSON.stringify(body) || undefined
        }));
        return new ParsedProxyResponse<T>(resp);
    }

    async testApiKeyRequest<T>(apiKey: string, url: string, method: string, body?: any): Promise<ParsedProxyResponse<T>> {
        const resp = await cassava.testing.testRouter(this, cassava.testing.createTestProxyEvent(url, method, {
            headers: {
                Authorization: `Bearer ${apiKey}`
            },
            body: body && JSON.stringify(body) || undefined
        }));
        return new ParsedProxyResponse<T>(resp);
    }

    async testWebAppRequest<T>(url: string, method: string, body?: any): Promise<ParsedProxyResponse<T>> {
        const resp = await cassava.testing.testRouter(this, cassava.testing.createTestProxyEvent(url, method, {
            headers: {
                Cookie: defaultTestUser.cookie,
                "X-Requested-With": "XMLHttpRequest"
            },
            body: body && JSON.stringify(body) || undefined
        }));
        return new ParsedProxyResponse<T>(resp);
    }

    async testTeamMateRequest<T>(url: string, method: string, body?: any): Promise<ParsedProxyResponse<T>> {
        const resp = await cassava.testing.testRouter(this, cassava.testing.createTestProxyEvent(url, method, {
            headers: {
                Cookie: defaultTestUser.teamMate.cookie,
                "X-Requested-With": "XMLHttpRequest"
            },
            body: body && JSON.stringify(body) || undefined
        }));
        return new ParsedProxyResponse<T>(resp);
    }
}
