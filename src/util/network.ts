import {APIException, NetworkConnectionException} from "../Exception";
import {parseWithDate} from "./json-util";

type RequestInterceptor = (request: RequestInit) => void | Promise<void>;
type ResponseInterceptor = (response: Response) => void | Promise<void>;

const networkInterceptor: {request?: RequestInterceptor; response?: ResponseInterceptor} = {};

export function setRequestInterceptor(_: RequestInterceptor) {
    networkInterceptor.request = _;
}

export function setResponseInterceptor(_: ResponseInterceptor) {
    networkInterceptor.response = _;
}

export async function ajax<TRequest, TResponse>(method: string, path: string, pathParams: object, request: TRequest): Promise<TResponse> {
    // Replace {:param} in URL path
    let requestURL = url(path, pathParams);
    const headers = {
        "Content-Type": "application/json",
        Accept: "application/json",
    };
    const requestParameters: RequestInit = {method, headers};

    if (request) {
        if (method === "GET" || method === "DELETE") {
            requestURL += queryString(request);
        } else {
            requestParameters.body = JSON.stringify(request);
        }
    }

    if (networkInterceptor.request) {
        await networkInterceptor.request(requestParameters);
    }

    // Send and handle AJAX
    try {
        const response = await fetch(requestURL, requestParameters);
        if (networkInterceptor.response) {
            await networkInterceptor.response(response);
        }

        const responseText = await response.text();
        // API response may be void, in such case, JSON.parse will throw error
        const responseData = responseText ? parseWithDate(responseText) : {};

        if (response.ok) {
            // HTTP Status 200
            return responseData as TResponse;
        } else {
            // Try to get server errorMessage from response
            const errorMessage = responseData && responseData.message ? responseData.message : `failed to call ${requestURL}`;
            const errorId = responseData && responseData.id ? responseData.id : null;
            const errorCode = responseData && responseData.errorCode ? responseData.errorCode : null;

            if (!errorId && (response.status === 502 || response.status === 504)) {
                // Treat "cloud" error as Network Exception, e.g: gateway issue, load balancer unconnected to application server
                // Note: Status 503 is maintenance
                throw new NetworkConnectionException(`gateway error (${response.status})`, requestURL, {});
            } else {
                throw new APIException(errorMessage, response.status, requestURL, responseData, errorId, errorCode);
            }
        }
    } catch (e) {
        // Only APIException, NetworkConnectionException can be thrown
        if (e instanceof APIException) {
            throw e;
        } else {
            console.warn("Network native exception", e);
            throw new NetworkConnectionException(`failed to connect to ${requestURL}`, requestURL, e);
        }
    }
}

export function url(path: string, params: object): string {
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
                const valueString = value instanceof Date ? value.toISOString() : String(value);
                return `${encodeURIComponent(key)}=${encodeURIComponent(valueString)}`;
            })
            .join("&")
    );
}
