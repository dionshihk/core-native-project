import React, {ComponentType} from "react";
import {AppRegistry} from "react-native";
import {Provider} from "react-redux";
import {app} from "../app";
import {EventLog, EventLoggerConfig} from "../EventLogger";
import {ErrorListener} from "../module";
import {call, delay} from "redux-saga/effects";
import {errorAction} from "../reducer";
import {ErrorBoundary} from "../util/ErrorBoundary";
import {ajax} from "../util/network";
import {Module} from "./Module";

type ErrorHandlerModuleClass = new (name: string, state: {}) => Module<{}> & ErrorListener;

interface BootstrapOption {
    registeredAppName: string;
    componentType: ComponentType<{}>;
    errorHandlerModule: ErrorHandlerModuleClass;
    beforeRendering?: () => Promise<any>;
    eventLoggerConfig?: EventLoggerConfig;
}

export function startApp(config: BootstrapOption) {
    renderApp(config.registeredAppName, config.componentType, config.beforeRendering);
    setupGlobalErrorHandler(config.errorHandlerModule);

    if (config.eventLoggerConfig) {
        app.eventLoggerConfig = config.eventLoggerConfig;
        if (process.env.NODE_ENV === "production") {
            app.sagaMiddleware.run(function*() {
                while (true) {
                    yield delay(app.eventLoggerConfig!.sendingFrequency * 1000);
                    try {
                        const logs: EventLog[] = (app.eventLogger as any).logQueue;
                        if (logs.length > 0) {
                            yield call(ajax, "PUT", app.eventLoggerConfig!.serverURL, {}, {events: logs});
                            (app.eventLogger as any).logQueue = [];
                        }
                    } catch (e) {
                        // Silent if sending error
                    }
                }
            });
        }
    }
}

function renderApp(registeredAppName: string, EntryComponent: ComponentType<{}>, beforeRendering?: () => Promise<any>) {
    class WrappedAppComponent extends React.PureComponent<{}, {initialized: boolean}> {
        constructor(props: {}) {
            super(props);
            this.state = {initialized: false};
        }

        async componentDidMount() {
            if (beforeRendering) {
                await beforeRendering();
            }
            this.setState({initialized: true});
        }

        render() {
            return (
                this.state.initialized && (
                    <Provider store={app.store}>
                        <ErrorBoundary>
                            <EntryComponent />
                        </ErrorBoundary>
                    </Provider>
                )
            );
        }
    }
    AppRegistry.registerComponent(registeredAppName, () => WrappedAppComponent);
}

function setupGlobalErrorHandler(ErrorHandlerModule: ErrorHandlerModuleClass) {
    ErrorUtils.setGlobalHandler((error, isFatal) => {
        if (isFatal) {
            console.info("***** Fatal Error *****");
        }
        app.store.dispatch(errorAction(error));
    });

    const errorHandler = new ErrorHandlerModule("error-handler", {});
    app.errorHandler = errorHandler.onError.bind(errorHandler);
}
