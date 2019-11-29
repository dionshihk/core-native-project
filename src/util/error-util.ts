export function serializeError(errorObject: any): string {
    if (errorObject) {
        const jsonString = JSON.stringify(errorObject);
        let message = typeof errorObject.toString === "function" ? errorObject.toString() + "\n" : "";
        if (jsonString) {
            message += jsonString;
        }
        return message;
    } else {
        return "[NULL]";
    }
}
