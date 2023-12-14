import {applyMiddleware, compose, createStore, type Store, type StoreEnhancer} from "redux";
import createSagaMiddleware, {type SagaMiddleware} from "redux-saga";
import {takeEvery} from "redux-saga/effects";
import {LoggerImpl, type LoggerConfig, type Logger} from "./Logger";
import {type ActionHandler, type ErrorHandler, executeAction} from "./module";
import {type Action, LOADING_ACTION, rootReducer, type State} from "./reducer";
import {captureError} from "./util/error-util";

declare const window: any;

interface App {
    readonly store: Store<State>;
    readonly sagaMiddleware: SagaMiddleware<any>;
    readonly actionHandlers: {[actionType: string]: ActionHandler};
    readonly logger: LoggerImpl;
    loggerConfig: LoggerConfig | null;
    errorHandler: ErrorHandler;
}

export const app = createApp();
export const logger: Logger = app.logger;

function composeWithDevTools(enhancer: StoreEnhancer): StoreEnhancer {
    let composeEnhancers = compose;
    if (process.env.NODE_ENV === "development") {
        const extension = window.__REDUX_DEVTOOLS_EXTENSION_COMPOSE__;
        if (extension) {
            composeEnhancers = extension({
                // Ref: https://github.com/reduxjs/redux-devtools/blob/main/extension/docs/API/Arguments.md#actionsdenylist--actionsallowlist
                actionsDenylist: [LOADING_ACTION],
            });
        }
    }
    return composeEnhancers(enhancer);
}

function createApp(): App {
    const eventLogger = new LoggerImpl();
    const sagaMiddleware = createSagaMiddleware({
        onError: (error, info) => captureError(error, "@@framework/detached-saga", {extraStacktrace: info.sagaStack}),
    });
    const store: Store<State> = createStore(rootReducer(), composeWithDevTools(applyMiddleware(sagaMiddleware)));
    sagaMiddleware.run(function* () {
        yield takeEvery("*", function* (action: Action<any>) {
            const handler = app.actionHandlers[action.type];
            if (handler) {
                // eslint-disable-next-line @typescript-eslint/ban-ts-comment
                // @ts-ignore
                yield* executeAction(action.type, handler, ...action.payload);
            }
        });
    });

    return {
        store,
        sagaMiddleware,
        actionHandlers: {},
        logger: eventLogger,
        loggerConfig: null,
        *errorHandler() {},
    };
}
