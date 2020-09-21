/**
 * For React Native, the caller is responsible for providing deviceId/route etc. to logger context.
 *
 * Only sessionId is provided here.
 * Session ID is fixed during app lifecycle (till full exit from phone memory).
 * A new session ID is generated for next use.
 */

function generateUniqueId() {
    // A UUID for current visitor, based on:
    // - Current time (in millisecond)
    // - Some random number (around 1000~10000000)
    // E.g: 169e68f80c9-1b4104
    return new Date().getTime().toString(16) + "-" + Math.floor(Math.random() * 9999900 + 1000).toString(16);
}

export const loggerContext = {
    session_id: generateUniqueId(),
};
