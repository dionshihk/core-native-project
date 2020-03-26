import {app} from "../app";
import {Logger} from "../Logger";
import {LifecycleDecoratorFlag, TickIntervalDecoratorFlag} from "../module";
import {setStateAction, State} from "../reducer";
import {SagaIterator} from "../typed-saga";

export interface ModuleLifecycleListener<RouteParam extends {} = {}> {
    onEnter: ((routeParameters: RouteParam) => SagaIterator) & LifecycleDecoratorFlag;
    onDestroy: (() => SagaIterator) & LifecycleDecoratorFlag;
    onTick: (() => SagaIterator) & LifecycleDecoratorFlag & TickIntervalDecoratorFlag;
    onAppActive: (() => SagaIterator) & LifecycleDecoratorFlag;
    onAppInactive: (() => SagaIterator) & LifecycleDecoratorFlag;
    onFocus: (() => SagaIterator) & LifecycleDecoratorFlag;
    onBlur: (() => SagaIterator) & LifecycleDecoratorFlag;
}

export class Module<RootState extends State, ModuleName extends keyof RootState["app"] & string, RouteParam extends {} = {}> implements ModuleLifecycleListener<RouteParam> {
    constructor(readonly name: ModuleName, readonly initialState: RootState["app"][ModuleName]) {}

    *onEnter(routeParameters: RouteParam): SagaIterator {
        /**
         * Called when the attached component is mounted.
         * The routeParameters is auto specified if the component is connected to React Navigator.
         * Otherwise, routeParameters will be {}.
         */
    }

    *onDestroy(): SagaIterator {
        /**
         * Called when the attached component is going to unmount.
         */
    }

    *onTick(): SagaIterator {
        /**
         * Called periodically during the lifecycle of attached component.
         * Usually used together with @Interval decorator, to specify the period (in second).
         * Attention: The next tick will not be triggered, until the current tick has finished.
         */
    }

    *onAppActive(): SagaIterator {
        /**
         * Called when the app becomes active (foreground) from background task.
         * Usually used for fetching updated configuration.
         */
    }

    *onAppInactive(): SagaIterator {
        /**
         * Called when the app becomes inactive (background) from foreground task.
         * Usually used for storing some data into storage.
         */
    }

    *onFocus(): SagaIterator {
        /**
         * Called when the attached component is connected to React Navigator, and gets focused.
         */
    }

    *onBlur(): SagaIterator {
        /**
         * Called when the attached component is connected to React Navigator, and gets blurred.
         */
    }

    get state(): Readonly<RootState["app"][ModuleName]> {
        return this.rootState.app[this.name];
    }

    get rootState(): Readonly<RootState> {
        return app.store.getState() as Readonly<RootState>;
    }

    get logger(): Logger {
        return app.logger;
    }

    /**
     * CAVEAT:
     * Do not use Partial<ModuleState> as parameter.
     * Because it allows {foo: undefined} to be passed, and set that field undefined, which is not supposed to be.
     */
    setState<K extends keyof RootState["app"][ModuleName]>(newState: Pick<RootState["app"][ModuleName], K> | RootState["app"][ModuleName]) {
        app.store.dispatch(setStateAction(this.name, newState as object, `@@${this.name}/setState[${Object.keys(newState).join(",")}]`));
    }
}
