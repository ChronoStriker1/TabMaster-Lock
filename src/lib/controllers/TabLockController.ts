import { call } from '@decky/api'
import { sensitiveCall } from './SensitiveCall'

export interface LockStatus {
    configured: boolean
    protected: string[]
    unlocked: string[]
}

export type LockAction = 'protect' | 'unlock' | 'unprotect' | 'change'
interface LockResult {
    ok: boolean
    message?: string
    status?: LockStatus
}

/** Session state only; PINs and persistent verifiers never live here. */
export class TabLockController {
    status: LockStatus = { configured: false, protected: [], unlocked: [] }
    ready = false
    error = ''
    revision = 0
    private generation = 0
    private userId = ''
    readonly events = new EventTarget()

    constructor(private onChange: () => void) {}

    private changed() {
        this.revision++
        this.events.dispatchEvent(new Event('change'))
        this.onChange()
    }

    reset() {
        this.generation++
        this.ready = false
        this.userId = ''
        this.status = { configured: false, protected: [], unlocked: [] }
        this.changed()
    }

    async load(userId: string) {
        this.reset()
        this.userId = userId
        const generation = this.generation
        try {
            // A frontend reload must never inherit an old backend unlock session.
            const status = await call<[string], LockStatus>('lock_tabs', userId)
            if (generation !== this.generation) return
            this.status = status
            this.ready = true
            this.error = ''
        } catch {
            if (generation !== this.generation) return
            this.error = 'Tab locks could not load. Reload TabMaster Lock to try again.'
        }
        this.changed()
    }

    isProtected(id: string) {
        return this.status.protected.includes(id)
    }

    isLocked(id: string) {
        return !this.ready || (this.isProtected(id) && !this.status.unlocked.includes(id))
    }

    async authenticate(action: LockAction, tabId: string, pin: string, newPin?: string): Promise<string | null> {
        const generation = this.generation
        if (!this.ready) return 'Tab locks are unavailable. Reload the plugin.'
        try {
            const result = await sensitiveCall<LockResult>(
                'authenticate_tab', this.userId, action, tabId, pin, newPin
            )
            if (generation !== this.generation) return 'Session changed. Please try again.'
            if (!result.ok || !result.status) return result.message ?? 'PIN verification failed.'
            this.status = result.status
            this.changed()
            return null
        } catch {
            return 'Unable to verify the PIN. Please try again.'
        }
    }

    async lock(tabId?: string) {
        const generation = ++this.generation
        // Hide immediately, before the backend round trip.
        this.status = { ...this.status, unlocked: tabId ? this.status.unlocked.filter(id => id !== tabId) : [] }
        this.changed()
        if (!this.userId) return
        try {
            await call<[string, string | undefined], LockStatus>('lock_tabs', this.userId, tabId)
        } catch {
            if (generation !== this.generation) return
            this.ready = false
            this.error = 'Tab locks lost their backend connection. Reload the plugin.'
            this.changed()
        }
    }
}
