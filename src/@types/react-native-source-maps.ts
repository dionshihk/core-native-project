// Ref: https://github.com/philipshurpik/react-native-source-maps
declare module "react-native-source-maps" {
    export function initSourceMaps(options: {sourceMapBundle: string; collapseInLine?: boolean; projectPath?: string}): void;
    export function getStackTrace(error: any): Promise<any>;
}
