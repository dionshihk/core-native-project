export function serializeError(errorObject: any): string {
    if (errorObject) {
        const jsonString = JSON.stringify(errorObject);
        let message = typeof errorObject.toString === "function" ? errorObject.toString() + "\n" : "";
        if (jsonString.length > 300) {
            // Over-long message may lead to Chrome crash, or server-side drop request
            message += jsonString.substr(0, 300) + "...";
        } else {
            message += jsonString;
        }
        return message;
    } else {
        return "[NULL]";
    }
}
