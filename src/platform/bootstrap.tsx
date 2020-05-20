import React from "react";
import {AppRegistry, AppState, AppStateStatus} from "react-native";
import {Provider} from "react-redux";
import {app} from "../app";
import {LoggerConfig} from "../Logger";
import {ErrorListener} from "../module";
import {call, delay} from "../typed-saga";
import {ErrorBoundary} from "../util/ErrorBoundary";
import {ajax} from "../util/network";
import {Exception, NetworkConnectionException} from "../Exception";
import {captureError} from "../util/error-util";

interface BootstrapOption {
    registeredAppName: string;
    componentType: React.ComponentType;
    errorListener: ErrorListener;
    beforeRendering?: () => Promise<any>;
    logger?: LoggerConfig;
}

const LOGGER_ACTION = "@@framework/logger";

export function startApp(config: BootstrapOption) {
    setupGlobalErrorHandler(config.errorListener);
    runBackgroundLoop(config.logger);
    renderRoot(config.registeredAppName, config.componentType, config.beforeRendering);
}

function setupGlobalErrorHandler(errorListener: ErrorListener) {
    app.errorHandler = errorListener.onError.bind(errorListener);
    ErrorUtils.setGlobalHandler((error, isFatal) => captureError(error, "@@framework/global", {severity: isFatal ? "fatal" : undefined}));
}

function renderRoot(registeredAppName: string, EntryComponent: React.ComponentType, beforeRendering?: () => Promise<any>) {
    class WrappedAppComponent extends React.PureComponent<{}, {initialized: boolean; appState: AppStateStatus}> {
        constructor(props: {}) {
            super(props);
            this.state = {initialized: false, appState: AppState.currentState};
        }

        async componentDidMount() {
            if (beforeRendering) {
                await beforeRendering();
            }
            this.setState({initialized: true});
            AppState.addEventListener("change", this.onAppStateChange);
        }

        componentWillUnmount() {
            AppState.removeEventListener("change", this.onAppStateChange);
        }

        onAppStateChange = (nextAppState: AppStateStatus) => {
            const {appState} = this.state;
            if (["inactive", "background"].includes(appState) && nextAppState === "active") {
                app.logger.info("@@ACTIVE", {prevState: appState});
            } else if (appState === "active" && ["inactive", "background"].includes(nextAppState)) {
                app.logger.info("@@INACTIVE", {nextState: nextAppState});
            }
            this.setState({appState: nextAppState});
        };

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

function runBackgroundLoop(loggerConfig: LoggerConfig | undefined) {
    app.logger.info("@@ENTER", {});
    app.loggerConfig = loggerConfig || null;
    app.sagaMiddleware.run(function* () {
        while (true) {
            // Loop on every 20 second
            yield delay(20000);

            // Send collected log to event server
            if (loggerConfig) {
                yield* call(sendEventLogs, loggerConfig);
            }
        }
    });
}

async function sendEventLogs(config: LoggerConfig): Promise<void> {
    try {
        const logs = app.logger.collect();
        if (logs.length > 0) {
            await call(ajax, "POST", config.serverURL, {}, {events: logs}, true);
            app.logger.empty();
        }
    } catch (e) {
        if (e instanceof NetworkConnectionException) {
            // Log this case and retry later
            app.logger.exception(e, {}, LOGGER_ACTION);
        } else if (e instanceof Exception) {
            // If not network error, retry always leads to same error, so have to give up
            const length = app.logger.collect().length;
            app.logger.empty();
            app.logger.exception(e, {droppedLogs: length.toString()}, LOGGER_ACTION);
        }
    }
}
