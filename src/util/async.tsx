import React from "react";

/**
 * CAVEAT:
 * When using require("..").Component in React Native, the type info is discarded.
 * If the Props of returned component is not {}, you should explicitly specify the generic <T> for the required component (but not recommended).
 */
export function async<T>(componentLoader: () => React.ComponentType<T>, loadingComponent: React.ReactNode = null): React.ComponentType<T> {
    interface State {
        Component: React.ComponentType<T> | null;
    }

    return class AsyncWrapperComponent extends React.PureComponent<T, State> {
        constructor(props: T) {
            super(props);
            this.state = {Component: null};
        }

        override componentDidMount() {
            if (this.state.Component === null) {
                const Component = componentLoader();
                this.setState({Component});
            }
        }

        override render() {
            const {Component} = this.state;
            return Component ? <Component {...this.props} /> : loadingComponent;
        }
    };
}
