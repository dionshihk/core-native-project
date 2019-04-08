import {APIException, NetworkConnectionException} from "../Exception";
import {parseWithDate} from "./json";

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
            const errorMessage = responseData && responseData.message ? responseData.message : `failed to call ${url}`;
            const errorId = responseData && responseData.id ? responseData.id : null;
            const errorCode = responseData && responseData.errorCode ? responseData.errorCode : null;
            throw new APIException(errorMessage, response.status, requestURL, errorId, errorCode);
        }
    } catch (e) {
        // Only APIException, NetworkConnectionException can be thrown
        if (e instanceof APIException) {
            throw e;
        } else {
            console.info("Network Native Exception", e);
            throw new NetworkConnectionException(requestURL);
        }
    }
}

export function url(pattern: string, params: object): string {
    let url = pattern;
    Object.entries(params).forEach(([name, value]) => {
        const encodedValue = encodeURIComponent(value.toString());
        url = url.replace(":" + name, encodedValue);
    });
    return url;
}

export function queryString(params: any): string {
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
                const valueString = value instanceof Date ? value.toISOString() : value.toString();
                return `${encodeURIComponent(key)}=${encodeURIComponent(valueString)}`;
            })
            .join("&")
    );
}
