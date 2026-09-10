import { DialogButton, Focusable, GamepadButton, GamepadEvent, ModalRoot, showModal } from '@decky/ui'
import { Fragment, ReactElement, useEffect, useRef, useState } from 'react'
import { FaLock } from 'react-icons/fa'
import { LockAction, TabLockController } from '../../lib/controllers/TabLockController'

export function useTabLocks(locks: TabLockController) {
    const [, refresh] = useState(locks.revision)
    useEffect(() => {
        const changed = () => refresh(locks.revision)
        locks.events.addEventListener('change', changed)
        changed()
        return () => locks.events.removeEventListener('change', changed)
    }, [locks])
    return locks
}

// Direct controller entry, with matching touch targets and numeric keyboard support.
const keys = [
    { digit: '0', label: 'A', button: GamepadButton.OK },
    { digit: '1', label: 'B', button: GamepadButton.CANCEL },
    { digit: '2', label: 'X', button: GamepadButton.SECONDARY },
    { digit: '3', label: 'Y', button: GamepadButton.OPTIONS },
    { digit: '4', label: '↑', button: GamepadButton.DIR_UP },
    { digit: '5', label: '→', button: GamepadButton.DIR_RIGHT },
    { digit: '6', label: '↓', button: GamepadButton.DIR_DOWN },
    { digit: '7', label: '←', button: GamepadButton.DIR_LEFT },
    { digit: '8', label: 'L1', button: GamepadButton.BUMPER_LEFT },
    { digit: '9', label: 'R1', button: GamepadButton.BUMPER_RIGHT },
]

function PinEntry({ title, description, onSubmit, onCancel }: {
    title: string
    description: string
    onSubmit: (pin: string) => Promise<string | null>
    onCancel: () => void
}) {
    const [pin, setPin] = useState('')
    const [error, setError] = useState('')
    const [busy, setBusy] = useState(false)
    const current = useRef('')
    const pending = useRef(false)
    const alive = useRef(true)
    const entryRef = useRef<HTMLDivElement>(null)
    useEffect(() => { entryRef.current?.focus() }, [])
    useEffect(() => () => { alive.current = false; current.current = '' }, [])

    const enter = async (digit: string) => {
        if (pending.current || current.current.length >= 6) return
        const next = current.current + digit
        current.current = next
        setPin(next)
        setError('')
        if (next.length !== 6) return
        pending.current = true
        setBusy(true)
        let message: string | null
        try { message = await onSubmit(next) } catch { message = 'Unable to verify the PIN. Please try again.' }
        current.current = ''
        pending.current = false
        if (alive.current) {
            setPin('')
            setBusy(false)
            setError(message ?? '')
        }
    }
    const erase = () => {
        if (pending.current) return
        current.current = current.current.slice(0, -1)
        setPin(current.current)
        setError('')
    }
    const gamepad = (event: GamepadEvent) => {
        const key = keys.find(key => key.button === event.detail.button)
        const button = event.detail.button
        if (!key && button !== GamepadButton.START && button !== GamepadButton.SELECT) return
        event.preventDefault()
        event.stopPropagation()
        if (event.detail.is_repeat) return
        if (key) void enter(key.digit)
        else if (button === GamepadButton.START) erase()
        else onCancel()
    }

    return (
        <Focusable ref={entryRef} tabIndex={0} preferredFocus onActivate={() => {}} onButtonDown={gamepad} onKeyDown={event => {
            if (/^[0-9]$/.test(event.key)) { event.preventDefault(); void enter(event.key) }
            else if (event.key === 'Backspace') { event.preventDefault(); erase() }
            else if (event.key === 'Escape') { event.preventDefault(); onCancel() }
        }} style={{ padding: '12px', textAlign: 'center', color: '#fff', width: '420px', maxWidth: 'calc(100vw - 100px)', boxSizing: 'border-box', margin: 'auto', fontSize: '15px', lineHeight: '1.2' }}>
            <FaLock size={20} />
            <h2 style={{ margin: '6px 0', fontSize: '22px', lineHeight: '1.2' }}>{title}</h2>
            <p style={{ color: '#b8bcbf', margin: '6px 0', fontSize: '15px', lineHeight: '20px' }}>{description}</p>
            <div aria-label={`${pin.length} of 6 digits entered`} style={{ fontSize: '28px', lineHeight: '31px', letterSpacing: '10px', margin: '10px 0' }}>
                {Array.from({ length: 6 }, (_, index) => index < pin.length ? '●' : '○').join('')}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '6px' }}>
                {keys.map(key => (
                    <button key={key.digit} tabIndex={-1} disabled={busy} aria-label={`${key.digit}, controller ${key.label}`}
                        onClick={() => void enter(key.digit)}
                        style={{ padding: '4px', height: '48px', minHeight: 0, minWidth: 0, background: '#303b48', color: '#fff', border: '1px solid #65717e', borderRadius: '4px', fontSize: '20px', lineHeight: '22px' }}>
                        {key.digit}<small style={{ display: 'block', fontSize: '11px', lineHeight: '13px', color: '#a4d7ff' }}>{key.label}</small>
                    </button>
                ))}
            </div>
            <p role='status' style={{ minHeight: '18px', fontSize: '14px', lineHeight: '18px', color: error ? '#ff9b9b' : '#b8bcbf', margin: '8px 0' }}>
                {busy ? 'Checking…' : error || 'Enter six digits to continue'}
            </p>
            <div style={{ display: 'flex', justifyContent: 'center', gap: '16px' }}>
                <button tabIndex={-1} onClick={erase} disabled={busy}>☰ Backspace</button>
                <button tabIndex={-1} onClick={onCancel}>⧉ Cancel</button>
            </div>
        </Focusable>
    )
}

function PinModal({ locks, action, tabId, title, closeModal }: {
    locks: TabLockController; action: LockAction; tabId: string; title: string; closeModal?: () => void
}) {
    useTabLocks(locks)
    const setup = action === 'protect' && !locks.status.configured
    const [stage, setStage] = useState<'current' | 'new' | 'confirm'>(setup ? 'new' : 'current')
    const oldPin = useRef('')
    const newPin = useRef('')
    const generationUserSession = useRef(locks.revision)
    useEffect(() => () => { oldPin.current = ''; newPin.current = '' }, [])
    // Relocking/account changes cancel a partially completed PIN dialog.
    useEffect(() => {
        if (locks.revision !== generationUserSession.current) closeModal?.()
    }, [locks.revision])
    const submit = async (pin: string) => {
        if (stage === 'current' && action === 'change') {
            oldPin.current = pin
            setStage('new')
            return null
        }
        if (stage === 'new') {
            newPin.current = pin
            setStage('confirm')
            return null
        }
        if (stage === 'confirm' && pin !== newPin.current) {
            newPin.current = ''
            setStage('new')
            return 'PINs did not match. Choose your PIN again.'
        }
        const error = await locks.authenticate(action, tabId, action === 'change' ? oldPin.current : pin,
            action === 'change' ? pin : undefined)
        if (!error) closeModal?.()
        else if (action === 'change') {
            oldPin.current = ''
            newPin.current = ''
            setStage('current')
        }
        return error
    }
    return (
        <ModalRoot onCancel={closeModal} bDisableBackgroundDismiss>
            <PinEntry title={title} onCancel={() => closeModal?.()} onSubmit={submit}
                description={stage === 'new' ? 'Choose your six-digit TabMaster PIN.' : stage === 'confirm'
                    ? 'Enter your new PIN again to confirm.' : 'Enter your TabMaster PIN.'} />
        </ModalRoot>
    )
}

export function showTabPin(locks: TabLockController, action: LockAction, tabId: string, title: string) {
    showModal(<PinModal locks={locks} action={action} tabId={tabId} title={title} />)
}

export function LockedTab({ locks, id, title }: { locks: TabLockController; id: string; title: string }) {
    useTabLocks(locks)
    return (
        <div style={{ display: 'flex', height: '100%', minHeight: '300px', alignItems: 'center', justifyContent: 'center', textAlign: 'center' }}>
            <div style={{ maxWidth: '520px', padding: '24px' }}>
                <FaLock size={36} />
                <h2>{title}</h2>
                <p>{locks.error || (locks.ready ? 'This tab is locked. Enter your PIN to show its games.' : 'Loading tab locks…')}</p>
                {locks.ready && <DialogButton onClick={() => showTabPin(locks, 'unlock', id, `Unlock ${title}`)}>Unlock tab</DialogButton>}
            </div>
        </div>
    )
}

export function TabGuard({ locks, id, title, renderContent }: {
    locks: TabLockController; id: string; title: string; renderContent: () => ReactElement
}) {
    useTabLocks(locks)
    useEffect(() => () => {
        // Steam unmounts active tab content when switching tabs or leaving Library.
        if (locks.isProtected(id) && !locks.isLocked(id)) void locks.lock(id)
    }, [locks, id])
    return locks.isLocked(id) ? <LockedTab locks={locks} id={id} title={title} /> : <Fragment>{renderContent()}</Fragment>
}
