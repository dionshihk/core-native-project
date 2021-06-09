import React from "react";
import {AppState, AppStateStatus} from "react-native";
import {Task} from "redux-saga";
import {delay, call as rawCall} from "redux-saga/effects";
import {app} from "../app";
import {ActionCreators, executeAction} from "../module";
import {Module, ModuleLifecycleListener} from "./Module";

export class ModuleProxy<M extends Module<any, any>> {
    constructor(private module: M, private actions: ActionCreators<M>) {}

    getActions(): ActionCreators<M> {
        return this.actions;
    }

    attachLifecycle<P extends object>(ComponentType: React.ComponentType<P>): React.ComponentType<P> {
        const moduleName = this.module.name;
        const lifecycleListener = this.module as ModuleLifecycleListener;
        const modulePrototype = Object.getPrototypeOf(lifecycleListener);
        const actions = this.actions as any;

        return class extends React.PureComponent<P, {appState: AppStateStatus}> {
            static displayName = `ModuleBoundary(${moduleName})`;
            // Copy static navigation options, important for navigator
            static navigationOptions = (ComponentType as any).navigationOptions;

            private lifecycleSagaTask: Task | null = null;
            private unsubscribeFocus: (() => void) | undefined;
            private unsubscribeBlur: (() => void) | undefined;
            private tickCount: number = 0;
            private mountedTime: number = Date.now();

            constructor(props: P) {
                super(props);
                this.state = {appState: AppState.currentState};
            }

            override componentDidMount() {
                this.lifecycleSagaTask = app.sagaMiddleware.run(this.lifecycleSaga.bind(this));

                // According to the document, this API may change soon
                // Ref: https://facebook.github.io/react-native/docs/appstate#addeventlistener
                AppState.addEventListener("change", this.onAppStateChange);

                const props: any = this.props;
                if ("navigation" in props && typeof props.navigation.addListener === "function") {
                    if (this.hasOwnLifecycle("onFocus")) {
                        this.unsubscribeFocus = props.navigation.addListener("focus", () => {
                            app.store.dispatch(actions.onFocus());
                        });
                    }
                    if (this.hasOwnLifecycle("onBlur")) {
                        this.unsubscribeBlur = props.navigation.addListener("blur", () => {
                            app.store.dispatch(actions.onBlur());
                        });
                    }
                }
            }

            override componentWillUnmount() {
                if (this.hasOwnLifecycle("onDestroy")) {
                    app.store.dispatch(actions.onDestroy());
                }

                app.logger.info({
                    action: `${moduleName}/@@DESTROY`,
                    info: {
                        tick_count: this.tickCount.toString(),
                        staying_second: ((Date.now() - this.mountedTime) / 1000).toFixed(2),
                    },
                });

                try {
                    this.lifecycleSagaTask?.cancel();
                } catch (e) {
                    // In rare case, it may throw error, just ignore
                }

                this.unsubscribeFocus?.();
                this.unsubscribeBlur?.();
                AppState.removeEventListener("change", this.onAppStateChange);
            }

            onAppStateChange = (nextAppState: AppStateStatus) => {
                const {appState} = this.state;
                if (["inactive", "background"].includes(appState) && nextAppState === "active") {
                    if (this.hasOwnLifecycle("onAppActive")) {
                        app.store.dispatch(actions.onAppActive());
                    }
                } else if (appState === "active" && ["inactive", "background"].includes(nextAppState)) {
                    if (this.hasOwnLifecycle("onAppInactive")) {
                        app.store.dispatch(actions.onAppInactive());
                    }
                }
                this.setState({appState: nextAppState});
            };

            override render() {
                return <ComponentType {...this.props} />;
            }

            private hasOwnLifecycle = (methodName: keyof ModuleLifecycleListener): boolean => {
                return Object.prototype.hasOwnProperty.call(modulePrototype, methodName);
            };

            private *lifecycleSaga() {
                /**
                 * CAVEAT:
                 * Do not use <yield* executeAction> for lifecycle actions.
                 * It will lead to cancellation issue, which cannot stop the lifecycleSaga as expected.
                 *
                 * https://github.com/redux-saga/redux-saga/issues/1986
                 */
                const props: any = this.props;

                const enterActionName = `${moduleName}/@@ENTER`;
                const startTime = Date.now();
                if ("navigation" in props) {
                    yield rawCall(executeAction, enterActionName, lifecycleListener.onEnter.bind(lifecycleListener), props.route?.params || {});
                } else {
                    yield rawCall(executeAction, enterActionName, lifecycleListener.onEnter.bind(lifecycleListener), {});
                }

                app.logger.info({
                    action: enterActionName,
                    elapsedTime: Date.now() - startTime,
                    info: {
                        component_props: JSON.stringify(props),
                    },
                });

                if (this.hasOwnLifecycle("onTick")) {
                    const tickIntervalInMillisecond = (lifecycleListener.onTick.tickInterval || 5) * 1000;
                    const boundTicker = lifecycleListener.onTick.bind(lifecycleListener);
                    const tickActionName = `${moduleName}/@@TICK`;
                    while (true) {
                        yield rawCall(executeAction, tickActionName, boundTicker);
                        this.tickCount++;
                        yield delay(tickIntervalInMillisecond);
                    }
                }
            }
        };
    }
}
