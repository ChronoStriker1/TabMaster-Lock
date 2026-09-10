import { MenuItem } from '@decky/ui'
import { Fragment } from 'react'
import { TabLockController } from '../../lib/controllers/TabLockController'
import { showTabPin, useTabLocks } from './PinScreen'

export function TabLockMenu({ locks, id, title }: { locks: TabLockController; id: string; title: string }) {
    useTabLocks(locks)
    if (!locks.ready) return <MenuItem disabled>Tab locks unavailable — reload plugin</MenuItem>
    if (!locks.isProtected(id)) return (
        <MenuItem onClick={() => showTabPin(locks, 'protect', id, `Protect ${title}`)}>Protect with PIN</MenuItem>
    )
    return (
        <Fragment>
            {locks.isLocked(id)
                ? <MenuItem onClick={() => showTabPin(locks, 'unlock', id, `Unlock ${title}`)}>Unlock with PIN</MenuItem>
                : <MenuItem onClick={() => void locks.lock(id)}>Lock tab now</MenuItem>}
            <MenuItem onClick={() => showTabPin(locks, 'unprotect', id, `Remove protection: ${title}`)}>Remove PIN protection</MenuItem>
        </Fragment>
    )
}
