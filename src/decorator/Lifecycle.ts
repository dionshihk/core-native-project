import {ModuleLifecycleListener} from "../platform/Module";
import {ActionHandler, LifecycleDecoratorFlag} from "../module";

type LifecycleHandlerDecorator = (target: object, propertyKey: keyof ModuleLifecycleListener, descriptor: TypedPropertyDescriptor<ActionHandler & LifecycleDecoratorFlag>) => TypedPropertyDescriptor<ActionHandler>;

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
