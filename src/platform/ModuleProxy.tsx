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
                if ("navigation" in props) {
                    const navigation = props.navigation;
                    // `focus` and `blur` in React Navigation 5.x are equivalent to `willFocus` and `willBlur` in React Navigation 4.x
                    // https://reactnavigation.org/docs/upgrading-from-4.x/#navigation-events
                    this.unsubscribeFocus = navigation.addListener("focus", () => {
                        if (lifecycleListener.onFocus.isLifecycle) {
                            app.store.dispatch(actions.onFocus());
                        }
                    });
                    this.unsubscribeBlur = navigation.addListener("blur", () => {
                        if (lifecycleListener.onBlur.isLifecycle) {
                            app.store.dispatch(actions.onBlur());
                        }
                    });
                }
            }

            override componentWillUnmount() {
                if (lifecycleListener.onDestroy.isLifecycle) {
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

            override render() {
                return <ComponentType {...this.props} />;
            }

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
                if (lifecycleListener.onEnter.isLifecycle) {
                    const startTime = Date.now();
                    if ("navigation" in props) {
                        /**
                         * For react navigation < 5, use props.navigation.state.params.
                         * For react navigation 5, use props.route.params.
                         */
                        let routeParams;
                        if (typeof props.navigation.state === "object") {
                            routeParams = props.navigation.state.params;
                        } else {
                            routeParams = props.route?.params;
                        }
                        yield rawCall(executeAction, enterActionName, lifecycleListener.onEnter.bind(lifecycleListener), routeParams || {});
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
                } else {
                    app.logger.info({
                        action: enterActionName,
                        info: {
                            component_props: JSON.stringify(props),
                        },
                    });
                }

                if (lifecycleListener.onTick.isLifecycle) {
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
