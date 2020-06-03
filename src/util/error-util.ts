import {Exception, JavaScriptException} from "../Exception";
import {ErrorHandler} from "../module";
import {app} from "../app";
import {spawn} from "../typed-saga";
import {sendEventLogs} from "../platform/bootstrap";

interface ErrorExtra {
    severity?: "fatal";
    actionPayload?: string; // Should be masked
    extraStacktrace?: string;
}

export function errorToException(error: any): Exception {
    if (error instanceof Exception) {
        return error;
    } else if (error instanceof Error) {
        return new JavaScriptException(error.message);
    } else {
        try {
            const errorMessage = JSON.stringify(error);
            return new JavaScriptException(errorMessage);
        } catch (e) {
            return new JavaScriptException("[Unknown Error]");
        }
    }
}

export function captureError(error: any, action: string, extra: ErrorExtra = {}): Exception {
    if (process.env.NODE_ENV === "development") {
        console.error(`[framework] Error captured from [${action}]`, error);
    }

    const exception = errorToException(error);
    const errorStacktrace = error instanceof Error ? error.stack : undefined;
    const info = {...extra, stacktrace: errorStacktrace};

    app.logger.exception(exception, info, action);
    app.sagaMiddleware.run(runUserErrorHandler, app.errorHandler, exception);

    return exception;
}

let isUserErrorHandlerRunning = false;
export function* runUserErrorHandler(handler: ErrorHandler, exception: Exception) {
    if (app.loggerConfig) {
        // For app, report errors to event server ASAP, in case of sudden termination
        yield spawn(sendEventLogs, app.loggerConfig.serverURL);
    }
    if (isUserErrorHandlerRunning) return;

    try {
        isUserErrorHandlerRunning = true;
        yield* handler(exception);
    } catch (e) {
        console.warn("[framework] Fail to execute user-defined error handler", e);
    } finally {
        isUserErrorHandlerRunning = false;
    }
}
