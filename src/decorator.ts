import {SagaIterator} from "redux-saga";
import {put, delay} from "redux-saga/effects";
import {app} from "./app";
import {ActionHandler, LifecycleDecoratorFlag, TickIntervalDecoratorFlag} from "./module";
import {ModuleLifecycleListener} from "./platform/Module";
import {loadingAction, State} from "./reducer";
import {stringifyWithMask} from "./util/json";
import {NetworkConnectionException} from "./Exception";

/**
 * For latest decorator spec, please ref following:
 *      https://tc39.github.io/proposal-decorators/#sec-decorator-functions-element-descriptor
 *      https://github.com/tc39/proposal-decorators/blob/master/METAPROGRAMMING.md
 */

/**
 * Decorator type declaration, required by TypeScript
 */
type HandlerDecorator = (target: object, propertyKey: string, descriptor: TypedPropertyDescriptor<ActionHandler>) => TypedPropertyDescriptor<ActionHandler>;
type LifecycleHandlerDecorator = (target: object, propertyKey: keyof ModuleLifecycleListener, descriptor: TypedPropertyDescriptor<ActionHandler & LifecycleDecoratorFlag>) => TypedPropertyDescriptor<ActionHandler>;
type OnTickHandlerDecorator = (target: object, propertyKey: "onTick", descriptor: TypedPropertyDescriptor<ActionHandler & TickIntervalDecoratorFlag>) => TypedPropertyDescriptor<ActionHandler>;
type VoidFunctionDecorator = (target: object, propertyKey: string, descriptor: TypedPropertyDescriptor<(...args: any[]) => void>) => TypedPropertyDescriptor<(...args: any[]) => void>;

type ActionHandlerWithMetaData = ActionHandler & {actionName: string; maskedParams: string};

type HandlerInterceptor<S> = (handler: ActionHandlerWithMetaData, rootState: Readonly<S>) => SagaIterator;
type FunctionInterceptor<S> = (handler: () => void, rootState: Readonly<S>) => void;

/**
 * A helper for ActionHandler functions (Saga)
 */
export function createActionHandlerDecorator<S extends State = State>(interceptor: HandlerInterceptor<S>): HandlerDecorator {
    return (target: any) => {
        const descriptor = target.descriptor;
        const fn: ActionHandler = descriptor.value;
        descriptor.value = function*(...args: any[]): SagaIterator {
            const rootState: S = app.store.getState() as S;
            const boundFn: ActionHandlerWithMetaData = fn.bind(this, ...args) as any;
            // Do not use fn.actionName, it returns undefined
            boundFn.actionName = (descriptor.value as any).actionName;
            boundFn.maskedParams = stringifyWithMask(app.loggerConfig && app.loggerConfig.maskedKeywords ? app.loggerConfig.maskedKeywords : [], "***", ...args) || "[No Parameter]";
            yield* interceptor(boundFn, rootState);
        };
        return target;
    };
}

/**
 * A helper for regular functions
 */
export function createRegularDecorator<S extends State = State>(interceptor: FunctionInterceptor<S>): VoidFunctionDecorator {
    return (target: any) => {
        const descriptor = target.descriptor;
        const fn = descriptor.value;
        descriptor.value = function(...args: any[]) {
            const rootState: S = app.store.getState() as S;
            interceptor(fn.bind(this, ...args), rootState);
        };
        return target;
    };
}

/**
 * To mark state.loading[identifier] during Saga execution
 */
export function Loading(identifier: string = "global"): HandlerDecorator {
    return createActionHandlerDecorator(function*(handler) {
        try {
            yield put(loadingAction(true, identifier));
            yield* handler();
        } finally {
            yield put(loadingAction(false, identifier));
        }
    });
}

export function Log(): HandlerDecorator {
    return createActionHandlerDecorator(function*(handler) {
        const startTime = Date.now();
        try {
            yield* handler();
        } finally {
            app.logger.info(handler.actionName, {params: handler.maskedParams}, Date.now() - startTime);
        }
    });
}

export function RetryOnNetworkConnectionError(retryIntervalSecond: number = 3): HandlerDecorator {
    return createActionHandlerDecorator(function*(handler) {
        let retryTime = 0;
        while (true) {
            const currentRoundStartTime = Date.now();
            try {
                yield* handler();
                break;
            } catch (e) {
                if (e instanceof NetworkConnectionException) {
                    retryTime++;
                    app.logger.warn({
                        action: handler.actionName,
                        errorCode: "NETWORK_FAILURE_RETRY",
                        errorMessage: `Retry #${retryTime} after ${retryIntervalSecond} seconds: ${e.message}`,
                        info: {
                            params: handler.maskedParams,
                            errorObject: JSON.stringify(e),
                        },
                        elapsedTime: Date.now() - currentRoundStartTime,
                    });
                    yield delay(retryIntervalSecond * 1000);
                } else {
                    throw e;
                }
            }
        }
    });
}

/**
 * Required decorator when using lifecycle actions, including onEnter/onDestroy/...
 */
export function Lifecycle(): LifecycleHandlerDecorator {
    return (target: any) => {
        const descriptor = target.descriptor;
        descriptor.value.isLifecycle = true;
        return target;
    };
}

/**
 * Used for onTick action, to specify to tick interval in second
 */
export function Interval(second: number): OnTickHandlerDecorator {
    return (target: any) => {
        const descriptor = target.descriptor;
        descriptor.value.tickInterval = second;
        return target;
    };
}

/**
 * If specified, the Saga action cannot be entered by other threads during execution
 * Useful for error handler action
 */
export function Mutex(): HandlerDecorator {
    let isLocked = false;
    return createActionHandlerDecorator(function*(handler) {
        if (!isLocked) {
            try {
                isLocked = true;
                yield* handler();
            } finally {
                isLocked = false;
            }
        }
    });
}
