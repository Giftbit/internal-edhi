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

    async testPostLoginRequest<T>(loginResp: ParsedProxyResponse<any>, url: string, method: string, body?: any): Promise<ParsedProxyResponse<T>> {
        const sessionCookie = /gb_jwt_session=([^ ;]+)/.exec(loginResp.headers["Set-Cookie"])[1];
        const signatureCookie = /gb_jwt_signature=([^ ;]+)/.exec(loginResp.headers["Set-Cookie"])[1];
        if (!sessionCookie || !signatureCookie) {
            throw new Error("Did not find necessary cookies in login response.");
        }

        const resp = await cassava.testing.testRouter(this, cassava.testing.createTestProxyEvent(url, method, {
            headers: {
                Cookie: `gb_jwt_session=${sessionCookie}; gb_jwt_signature=${signatureCookie}`,
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
