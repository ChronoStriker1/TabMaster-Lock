interface BackendTransport {
    call: (route: string, ...args: unknown[]) => Promise<unknown>
    debug: (...args: unknown[]) => void
    write: (message: unknown) => void
    createPromiseResolver: (message: unknown) => unknown
}

/**
 * Decky 3.2 logs all ordinary RPC arguments, including PINs. Use the same
 * transport with a quiet receiver for this call only; don't change Decky's
 * shared logger or socket. Reply logging is safe: the backend returns status,
 * never credentials. Fail closed if the required transport is unavailable.
 */
export function sensitiveCall<T>(method: string, ...args: unknown[]): Promise<T> {
    const backend = (window as unknown as { DeckyBackend?: BackendTransport }).DeckyBackend
    if (!backend || typeof backend.call !== 'function' || typeof backend.write !== 'function'
        || typeof backend.createPromiseResolver !== 'function') {
        return Promise.reject(new Error('PIN transport unavailable'))
    }
    const quiet = new Proxy(backend, {
        get(target, property, receiver) {
            return property === 'debug' ? () => {} : Reflect.get(target, property, receiver)
        },
    })
    return quiet.call('loader/call_plugin_method', 'TabMaster Lock', method, ...args) as Promise<T>
}
