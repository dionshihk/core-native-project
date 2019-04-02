import React, {ComponentType} from "react";
import {AppRegistry} from "react-native";
import {Provider} from "react-redux";
import {app} from "../app";
import {ErrorListener} from "../module";
import {errorAction} from "../reducer";
import {ErrorBoundary} from "../util/ErrorBoundary";
import {Module} from "./Module";

type ErrorHandlerModuleClass = new (name: string, state: {}) => Module<{}> & ErrorListener;

interface BootstrapOption {
    registeredAppName: string;
    componentType: ComponentType<{}>;
    errorHandlerModule: ErrorHandlerModuleClass;
    beforeRendering?: () => Promise<any>;
    maskedEventKeywords?: RegExp[];
}

export function startApp(config: BootstrapOption) {
    renderApp(config.registeredAppName, config.componentType, config.beforeRendering);
    setupGlobalErrorHandler(config.errorHandlerModule);

    if (config.maskedEventKeywords) {
        app.maskedEventKeywords = config.maskedEventKeywords;
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
