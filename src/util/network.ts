/**
 * Attention:
 * Do NOT use "axios" for network utils in React Native.
 *
 * Explanation:
 * 1) Axios supports [nodejs-http] and [XHR] only, does not support [fetch] API.
 * 2) Although React Native has a XHR-same interface, but it has a bit difference on CORS policy.
 * 3) If XHR is used in React Native (i.e, what axios does), customized response header cannot be retrieved.
 *
 * Ref:
 * https://stackoverflow.com/questions/37897523/axios-get-access-to-response-header-fields
 */

import {APIException, NetworkConnectionException} from "../Exception";
import {parseWithDate} from "./json-util";

export type PathParams<T extends string> = string extends T
    ? {[key: string]: string | number}
    : T extends `${infer Start}:${infer Param}/${infer Rest}`
      ? {[k in Param | keyof PathParams<Rest>]: string | number}
      : T extends `${infer Start}:${infer Param}`
        ? {[k in Param]: string | number}
        : {};
export type Method = "get" | "GET" | "delete" | "DELETE" | "head" | "HEAD" | "options" | "OPTIONS" | "post" | "POST" | "put" | "PUT" | "patch" | "PATCH";

export interface APIErrorResponse {
    id?: string | null;
    errorCode?: string | null;
    message?: string | null;
}

type RequestHeaderInterceptor = (headers: Headers) => void | Promise<void>;
type ResponseHeaderInterceptor = (headers: Headers) => void | Promise<void>;

const networkInterceptor: {request?: RequestHeaderInterceptor; response?: ResponseHeaderInterceptor} = {};

export function setRequestHeaderInterceptor(_: RequestHeaderInterceptor) {
    networkInterceptor.request = _;
}

export function setResponseHeaderInterceptor(_: ResponseHeaderInterceptor) {
    networkInterceptor.response = _;
}

export async function ajax<Request, Response, Path extends string>(method: Method, path: Path, pathParams: PathParams<Path>, request: Request, skipInterceptor: boolean = false): Promise<Response> {
    let requestURL = urlParams(path, pathParams);
    const requestHeaders: Headers = new Headers({
        "Content-Type": "application/json",
        Accept: "application/json",
    });
    if (!skipInterceptor) {
        await networkInterceptor.request?.(requestHeaders);
    }

    const requestParameters: RequestInit = {method, headers: requestHeaders};
    if (request) {
        if (method === "GET" || method === "DELETE") {
            requestURL += queryString(request);
        } else {
            requestParameters.body = JSON.stringify(request);
        }
    }

    try {
        const response = await fetch(requestURL, requestParameters);

        if (!skipInterceptor) {
            await networkInterceptor.response?.(response.headers);
        }

        const responseText = await response.text();
        // API response may be void, in such case, JSON.parse will throw error
        const responseData = responseText ? parseWithDate(responseText) : {};

        if (response.ok) {
            // HTTP Status 200
            return responseData as Response;
        } else {
            // Try to get server errorMessage from response
            const apiErrorResponse = responseData as APIErrorResponse | undefined;
            const errorId: string | null = apiErrorResponse?.id || null;
            const errorCode: string | null = apiErrorResponse?.errorCode || null;

            if (!errorId && (response.status === 502 || response.status === 504)) {
                // Treat "cloud" error as Network Exception, e.g: gateway issue, load balancer unconnected to application server
                // Note: Status 503 is maintenance
                throw new NetworkConnectionException(`Gateway error (${response.status})`, requestURL);
            } else {
                const errorMessage: string = responseData && responseData.message ? responseData.message : `[No Response]`;
                throw new APIException(errorMessage, response.status, requestURL, responseData, errorId, errorCode);
            }
        }
    } catch (e) {
        // Only APIException, NetworkConnectionException can be thrown
        if (e instanceof APIException || e instanceof NetworkConnectionException) {
            throw e;
        } else {
            throw new NetworkConnectionException(`Failed to connect: ${requestURL}`, requestURL, e instanceof Error ? e.message : "[Unknown]");
        }
    }
}

export function uri<Request extends {[key: string]: any} | null | undefined>(path: string, request: Request): string {
    return path + queryString(request);
}

export function urlParams(path: string, params: object): string {
    let pathWithParams = path;
    Object.entries(params).forEach(([name, value]) => {
        const encodedValue = encodeURIComponent(value.toString());
        pathWithParams = pathWithParams.replace(":" + name, encodedValue);
    });
    return pathWithParams;
}

export function queryString(params: {[key: string]: any} | null | undefined): string {
    if (!params) {
        return "";
    }
    const entries = Object.entries(params);
    if (entries.length === 0) {
        return "";
    }
    return (
        "?" +
        entries
            .filter(_ => _[1] !== null) // If some value is NULL, do not append to URL
            .map(([key, value]) => {
                const valueString = value instanceof Date ? value.toISOString() : encodeURIComponent(String(value));
                return `${encodeURIComponent(key)}=${valueString}`;
            })
            .join("&")
    );
}
