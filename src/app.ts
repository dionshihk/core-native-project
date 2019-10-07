import {applyMiddleware, compose, createStore, Store, StoreEnhancer} from "redux";
import createSagaMiddleware, {SagaMiddleware} from "redux-saga";
import {takeEvery} from "redux-saga/effects";
import {LoggerImpl, LoggerConfig} from "./Logger";
import {ActionHandler, ErrorHandler, executeAction} from "./module";
import {Action, ERROR_ACTION_TYPE, ExceptionPayload, LOADING_ACTION, rootReducer, State} from "./reducer";

declare const window: any;

interface App {
    readonly store: Store<State>;
    readonly sagaMiddleware: SagaMiddleware<any>;
    readonly actionHandlers: {[actionType: string]: ActionHandler};
    readonly logger: LoggerImpl;
    errorHandler: ErrorHandler | null;
    loggerConfig: LoggerConfig | null;
}

function composeWithDevTools(enhancer: StoreEnhancer): StoreEnhancer {
    let composeEnhancers = compose;
    if (process.env.NODE_ENV !== "production") {
        const extension = window.__REDUX_DEVTOOLS_EXTENSION_COMPOSE__;
        if (extension) {
            composeEnhancers = extension({
                // Ref: https://github.com/zalmoxisus/redux-devtools-extension/blob/master/docs/API/Arguments.md
                actionsBlacklist: [LOADING_ACTION],
            });
        }
    }
    return composeEnhancers(enhancer);
}

function createApp(): App {
    const eventLogger = new LoggerImpl();
    const sagaMiddleware = createSagaMiddleware();
    const store: Store<State> = createStore(rootReducer(), composeWithDevTools(applyMiddleware(sagaMiddleware)));
    sagaMiddleware.run(function* rootSaga() {
        yield takeEvery("*", function*(action: Action<any>) {
            if (action.type === ERROR_ACTION_TYPE) {
                if (app.errorHandler) {
                    const errorAction = action as Action<ExceptionPayload>;
                    app.logger.exception(errorAction.payload.exception, errorAction.payload.actionName);
                    try {
                        yield* app.errorHandler(errorAction.payload.exception);
                    } catch (e) {
                        console.error("Error Caught In Error Handler");
                        console.error(e);
                    }
                }
            } else {
                const handler = app.actionHandlers[action.type];
                if (handler) {
                    yield* executeAction(handler, ...action.payload);
                }
            }
        });
    });

    return {
        store,
        sagaMiddleware,
        actionHandlers: {},
        logger: eventLogger,
        errorHandler: null,
        loggerConfig: null,
    };
}

export const app = createApp();
