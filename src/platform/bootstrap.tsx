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
import {initSourceMaps, getStackTrace} from "react-native-source-maps";

interface BootstrapOption {
    registeredAppName: string;
    componentType: ComponentType<{}>;
    errorListener: ErrorListener;
    beforeRendering?: () => Promise<any>;
    sourceMapFile?: string;
    logger?: LoggerConfig;
}

export function startApp(config: BootstrapOption) {
    if (config.sourceMapFile) {
        initSourceMaps({sourceMapBundle: config.sourceMapFile});
    }
    renderApp(config.registeredAppName, config.componentType, config.beforeRendering);
    setupGlobalErrorHandler(config.errorListener, config.sourceMapFile !== undefined);
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

function setupGlobalErrorHandler(errorListener: ErrorListener, supportSourceMap: boolean) {
    ErrorUtils.setGlobalHandler(async (error, isFatal) => {
        if (isFatal) {
            console.info("***** Fatal Error *****");
        }
        if (supportSourceMap && !__DEV__) {
            error.originalStack = error.stack;
            error.stack = await getStackTrace(error);
        }
        app.store.dispatch(errorAction(error));
    });

    app.errorHandler = errorListener.onError.bind(errorListener);
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
