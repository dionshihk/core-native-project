import React, {ComponentType} from "react";
import {AppRegistry} from "react-native";
import {Provider} from "react-redux";
import {app} from "../app";
import {LoggerConfig} from "../Logger";
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
    errorHandler: ErrorHandlerModuleClass;
    beforeRendering?: () => Promise<any>;
    logger?: LoggerConfig;
}

export function startApp(config: BootstrapOption) {
    renderApp(config.registeredAppName, config.componentType, config.beforeRendering);
    setupGlobalErrorHandler(config.errorHandler);
    setupLogger(config.logger);
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

function setupLogger(config: LoggerConfig | undefined) {
    if (config) {
        app.loggerConfig = config;
        if (process.env.NODE_ENV === "production") {
            app.sagaMiddleware.run(function*() {
                while (true) {
                    yield delay(config.sendingFrequency * 1000);
                    try {
                        const logs = app.logger.collect();
                        if (logs.length > 0) {
                            yield call(ajax, "PUT", config.serverURL, {}, {events: logs});
                            app.logger.empty();
                        }
                    } catch (e) {
                        // Silent if sending error
                    }
                }
            });
        }
    }
}
