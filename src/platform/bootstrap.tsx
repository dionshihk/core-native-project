import React, {ComponentType} from "react";
import {AppRegistry, AppState, AppStateStatus} from "react-native";
import {Provider} from "react-redux";
import {app} from "../app";
import {LoggerConfig} from "../Logger";
import {ErrorListener} from "../module";
import {call, delay} from "redux-saga/effects";
import ErrorBoundary from "../util/ErrorBoundary";
import {ajax} from "../util/network";
import {Exception, NetworkConnectionException} from "../Exception";
import {captureError} from "../util/error-util";

interface BootstrapOption {
    registeredAppName: string;
    componentType: ComponentType<{}>;
    errorListener: ErrorListener;
    beforeRendering?: () => Promise<any>;
    logger?: LoggerConfig;
}

export function startApp(config: BootstrapOption) {
    renderApp(config.registeredAppName, config.componentType, config.beforeRendering);
    setupGlobalErrorHandler(config.errorListener);
    setupLogger(config.logger);
}

function renderApp(registeredAppName: string, EntryComponent: ComponentType<{}>, beforeRendering?: () => Promise<any>) {
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

function setupGlobalErrorHandler(errorListener: ErrorListener) {
    ErrorUtils.setGlobalHandler((error, isFatal) => captureError(error, {triggeredBy: "global", severity: isFatal ? "fatal" : undefined}));
    app.errorHandler = errorListener.onError.bind(errorListener);
}

function setupLogger(config: LoggerConfig | undefined) {
    app.logger.info("@@ENTER", {});

    if (config) {
        app.loggerConfig = config;
        app.sagaMiddleware.run(function*() {
            while (true) {
                yield delay(config.sendingFrequency * 1000);
                try {
                    const logs = app.logger.collect();
                    if (logs.length > 0) {
                        yield call(ajax, "POST", config.serverURL, {}, {events: logs});
                        app.logger.empty();
                    }
                } catch (e) {
                    if (e instanceof NetworkConnectionException) {
                        // Log this case and retry later
                        app.logger.exception(e, {}, "@@framework/logger");
                    } else if (e instanceof Exception) {
                        // If not network error, retry always leads to same error, so have to give up
                        const length = app.logger.collect().length;
                        app.logger.empty();
                        app.logger.exception(e, {droppedLogs: length.toString()}, "@@framework/logger");
                    }
                }
            }
        });
    }
}
