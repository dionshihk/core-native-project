import React from "react";
import {AppState, AppStateStatus} from "react-native";
import {NavigationEventSubscription, NavigationScreenProps} from "react-navigation";
import {SagaIterator, Task} from "redux-saga";
import {delay, put} from "redux-saga/effects";
import {app} from "../app";
import {ActionCreators, executeAction} from "../module";
import {setStateAction} from "../reducer";
import {Module, ModuleLifecycleListener} from "./Module";

export class ModuleProxy<M extends Module<any>> {
    public constructor(private module: M, private actions: ActionCreators<M>) {}

    public getActions(): ActionCreators<M> {
        return this.actions;
    }

    public attachLifecycle<P extends {}>(ComponentType: React.ComponentType<P>): React.ComponentType<P> {
        const moduleName = this.module.name;
        const initialState = (this.module as any).initialState;
        const lifecycleListener = this.module as ModuleLifecycleListener;
        const actions = this.actions as any;

        return class extends React.PureComponent<P, {appState: AppStateStatus}> {
            public static displayName = `ModuleBoundary(${moduleName})`;

            // Copy static navigation options
            public static navigationOptions = (ComponentType as any).navigationOptions;

            private readonly lifecycleSagaTask: Task;
            private focusSubscription: NavigationEventSubscription | undefined;
            private blurSubscription: NavigationEventSubscription | undefined;

            constructor(props: P) {
                super(props);
                this.state = {appState: AppState.currentState};
                this.lifecycleSagaTask = app.sagaMiddleware.run(this.lifecycleSaga.bind(this));
                console.info(`Module [${moduleName}] attached component initially rendered`);
            }

            componentDidMount() {
                // According to the document, this API may change soon
                // Ref: https://facebook.github.io/react-native/docs/appstate#addeventlistener
                AppState.addEventListener("change", this.onAppStateChange);

                const props = this.props as (NavigationScreenProps | {});
                if ("navigation" in props) {
                    const navigation = props.navigation;
                    this.focusSubscription = navigation.addListener("didFocus", () => {
                        if (lifecycleListener.onFocus.isLifecycle) {
                            app.store.dispatch(actions.onFocus());
                        }
                    });
                    this.blurSubscription = navigation.addListener("willBlur", () => {
                        if (lifecycleListener.onBlur.isLifecycle) {
                            app.store.dispatch(actions.onBlur());
                        }
                    });
                }
            }

            componentWillUnmount() {
                if (lifecycleListener.onDestroy.isLifecycle) {
                    app.store.dispatch(actions.onDestroy());
                }

                if (this.blurSubscription) {
                    this.blurSubscription.remove();
                }

                if (this.focusSubscription) {
                    this.focusSubscription.remove();
                }

                this.lifecycleSagaTask.cancel();
                app.store.dispatch(setStateAction(moduleName, initialState, `@@${moduleName}/@@reset`));
                AppState.removeEventListener("change", this.onAppStateChange);
                console.info(`Module [${moduleName}] attached component destroyed`);
            }

            onAppStateChange = (nextAppState: AppStateStatus) => {
                const {appState} = this.state;
                if (["inactive", "background"].includes(appState) && nextAppState === "active") {
                    if (lifecycleListener.onAppActive.isLifecycle) {
                        app.store.dispatch(actions.onAppActive());
                    }
                } else if (appState === "active" && ["inactive", "background"].includes(nextAppState)) {
                    if (lifecycleListener.onAppInactive.isLifecycle) {
                        app.store.dispatch(actions.onAppInactive());
                    }
                }
                this.setState({appState: nextAppState});
            };

            private *lifecycleSaga(): SagaIterator {
                const props = this.props as (NavigationScreenProps | {});

                if (lifecycleListener.onEnter.isLifecycle) {
                    if ("navigation" in props && "state" in props.navigation) {
                        yield* executeAction(lifecycleListener.onEnter.bind(lifecycleListener), props.navigation.state.params, props.navigation.state.path);
                    } else {
                        yield* executeAction(lifecycleListener.onEnter.bind(lifecycleListener), {}, null);
                    }
                }

                if (lifecycleListener.onTick.isLifecycle) {
                    const tickIntervalInMillisecond = (lifecycleListener.onTick.tickInterval || 5) * 1000;
                    const boundTicker = lifecycleListener.onTick.bind(lifecycleListener);
                    while (true) {
                        yield* executeAction(boundTicker);
                        yield delay(tickIntervalInMillisecond);
                    }
                }
            }

            render() {
                return <ComponentType {...this.props} />;
            }
        };
    }
}
