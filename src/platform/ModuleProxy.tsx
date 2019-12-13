import React from "react";
import {AppState, AppStateStatus} from "react-native";
import {NavigationEventSubscription, NavigationInjectedProps} from "react-navigation";
import {Task} from "redux-saga";
import {delay} from "redux-saga/effects";
import {app} from "../app";
import {ActionCreators, executeAction} from "../module";
import {Module, ModuleLifecycleListener} from "./Module";

export class ModuleProxy<M extends Module<any>> {
    constructor(private module: M, private actions: ActionCreators<M>) {}

    getActions(): ActionCreators<M> {
        return this.actions;
    }

    attachLifecycle<P extends {}>(ComponentType: React.ComponentType<P>): React.ComponentType<P> {
        const moduleName = this.module.name;
        const lifecycleListener = this.module as ModuleLifecycleListener;
        const actions = this.actions as any;

        return class extends React.PureComponent<P, {appState: AppStateStatus}> {
            static displayName = `ModuleBoundary(${moduleName})`;
            // Copy static navigation options, important for navigator
            static navigationOptions = (ComponentType as any).navigationOptions;

            private readonly lifecycleSagaTask: Task;
            private focusSubscription: NavigationEventSubscription | undefined;
            private blurSubscription: NavigationEventSubscription | undefined;
            private successTickCount: number = 0;
            private mountedTime: number = Date.now();

            constructor(props: P) {
                super(props);
                this.state = {appState: AppState.currentState};
                this.lifecycleSagaTask = app.sagaMiddleware.run(this.lifecycleSaga.bind(this));
            }

            componentDidMount() {
                // According to the document, this API may change soon
                // Ref: https://facebook.github.io/react-native/docs/appstate#addeventlistener
                AppState.addEventListener("change", this.onAppStateChange);

                const props = this.props as NavigationInjectedProps | {};
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
                AppState.removeEventListener("change", this.onAppStateChange);

                this.lifecycleSagaTask.cancel();
                app.logger.info(`${moduleName}/@@DESTROY`, {
                    successTickCount: this.successTickCount.toString(),
                    stayingSecond: ((Date.now() - this.mountedTime) / 1000).toFixed(2),
                });
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

            render() {
                return <ComponentType {...this.props} />;
            }

            private *lifecycleSaga() {
                const props = this.props as NavigationInjectedProps | {};

                const enterActionName = `${moduleName}/@@ENTER`;
                if (lifecycleListener.onEnter.isLifecycle) {
                    const startTime = Date.now();
                    if ("navigation" in props) {
                        yield* executeAction(enterActionName, lifecycleListener.onEnter.bind(lifecycleListener), props.navigation.state.params, props.navigation.state.path || null);
                    } else {
                        yield* executeAction(enterActionName, lifecycleListener.onEnter.bind(lifecycleListener), {}, null);
                    }
                    app.logger.info(enterActionName, {componentProps: JSON.stringify(props)}, Date.now() - startTime);
                } else {
                    app.logger.info(enterActionName, {componentProps: JSON.stringify(props)});
                }

                if (lifecycleListener.onTick.isLifecycle) {
                    const tickIntervalInMillisecond = (lifecycleListener.onTick.tickInterval || 5) * 1000;
                    const boundTicker = lifecycleListener.onTick.bind(lifecycleListener);
                    const tickActionName = `${moduleName}/@@TICK`;
                    while (true) {
                        yield* executeAction(tickActionName, boundTicker);
                        this.successTickCount++;
                        yield delay(tickIntervalInMillisecond);
                    }
                }
            }
        };
    }
}
