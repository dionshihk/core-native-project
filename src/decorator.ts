import {SagaIterator} from "redux-saga";
import {put} from "redux-saga/effects";
import {app} from "./app";
import {ActionHandler, LifecycleDecoratorFlag, TickIntervalDecoratorFlag} from "./module";
import {ModuleLifecycleListener} from "./platform/Module";
import {loadingAction, State} from "./reducer";
import {stringifyWithMask} from "./util/json";

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

type HandlerInterceptor<S> = (handler: ActionHandler, rootState: Readonly<S>) => SagaIterator;
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
            yield* interceptor(fn.bind(this, ...args), rootState);
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

/**
 * To log (Result=OK) this action, including action name and parameters (masked)
 */
export function Log(): HandlerDecorator {
    return (target: any) => {
        const descriptor = target.descriptor;
        const fn: ActionHandler = descriptor.value;
        descriptor.value = function*(...args: any[]): SagaIterator {
            if (app.loggerConfig) {
                // Do not use fn directly, it is a different object
                const params = stringifyWithMask(app.loggerConfig.maskedKeywords || [], "***", ...args);
                const actionName = (descriptor.value as any).actionName;
                const context: {[key: string]: string} = params ? {params} : {};
                const onLogEnd = app.logger.info(actionName, context);
                try {
                    yield* fn.bind(this)(...args);
                } finally {
                    onLogEnd();
                }
            } else {
                yield* fn.bind(this)(...args);
            }
        };
        return target;
    };
}

/**
 * Required decorator when using lifecycle actions, including onRender/onDestroy/...
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
