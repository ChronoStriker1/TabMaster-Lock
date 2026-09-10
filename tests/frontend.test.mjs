import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import vm from 'node:vm'
import ts from 'typescript'

function loadTs(path, dependencies, globals = {}) {
    const source = readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')
    const { outputText } = ts.transpileModule(source, { compilerOptions: {
        target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS,
        jsx: ts.JsxEmit.React, jsxFactory: 'window.SP_REACT.createElement', jsxFragmentFactory: 'Fragment',
    } })
    const exports = {}
    vm.runInNewContext(outputText, {
        exports, Event, EventTarget,
        require: name => {
            assert.ok(name in dependencies, `Unexpected import: ${name}`)
            return dependencies[name]
        },
        ...globals,
    }, { filename: path })
    return exports
}

function controller(call) {
    const { TabLockController } = loadTs('src/lib/controllers/TabLockController.ts', {
        '@decky/api': { call }, './SensitiveCall': { sensitiveCall: call },
    })
    return new TabLockController(() => {})
}

const locked = { configured: true, protected: ['private'], unlocked: [] }
const unlocked = { ...locked, unlocked: ['private'] }

test('locks remain closed until loading succeeds; only protected tabs require a PIN', async () => {
    const locks = controller(async () => locked)
    assert.equal(locks.isLocked('private'), true)
    await locks.load('account-a')
    assert.equal(locks.isLocked('private'), true)
    assert.equal(locks.isLocked('AllGames'), false)
})

test('backend failure cannot reveal content', async () => {
    const locks = controller(async () => { throw new Error('offline') })
    await locks.load('account-a')
    assert.equal(locks.ready, false)
    assert.equal(locks.isLocked('private'), true)
    assert.match(locks.error, /could not load/)
})

test('late verification cannot unlock after relocking', async () => {
    let finish
    const locks = controller(async route => route === 'authenticate_tab'
        ? new Promise(resolve => { finish = resolve }) : locked)
    await locks.load('account-a')
    const auth = locks.authenticate('unlock', 'private', '')
    await locks.lock()
    finish({ ok: true, status: unlocked })
    assert.match(await auth, /Session changed/)
    assert.equal(locks.isLocked('private'), true)
})

test('late status cannot overwrite a new account', async () => {
    let finish
    const locks = controller(async (_route, user) => user === 'account-a'
        ? new Promise(resolve => { finish = resolve }) : { configured: false, protected: [], unlocked: [] })
    const old = locks.load('account-a')
    await locks.load('account-b')
    finish(unlocked)
    await old
    assert.equal(locks.status.configured, false)
})

test('relock hides immediately even while backend request is pending', async () => {
    let finish
    let calls = 0
    const locks = controller(async route => route === 'authenticate_tab'
        ? { ok: true, status: unlocked } : ++calls === 1 ? locked : new Promise(resolve => { finish = resolve }))
    await locks.load('account-a')
    await locks.authenticate('unlock', 'private', '')
    assert.equal(locks.isLocked('private'), false)
    const task = locks.lock()
    assert.equal(locks.isLocked('private'), true)
    finish(locked)
    await task
})

test('a locked TabGuard does not invoke or mount game content', () => {
    const createElement = (type, props, ...children) => ({ type, props, children })
    const { TabGuard, LockedTab } = loadTs('src/components/locks/PinScreen.tsx', {
        '@decky/ui': { GamepadButton: {} },
        react: { useState: () => [0, () => {}], useEffect: () => {}, Fragment: 'fragment' },
        'react-icons/fa': {},
    }, { window: { SP_REACT: { createElement } } })
    let calls = 0
    const locks = { revision: 0, isLocked: () => true }
    const renderContent = () => { calls++; return 'game grid' }
    const element = TabGuard({ locks, id: 'private', title: 'Private', renderContent })
    assert.equal(element.type, LockedTab)
    assert.equal(calls, 0)
    locks.isLocked = () => false
    TabGuard({ locks, id: 'private', title: 'Private', renderContent })
    assert.equal(calls, 1)
})

test('sensitive calls share request IDs without logging PIN arguments or mutating the logger', async () => {
    const logs = []
    const messages = []
    const backend = {
        reqId: 7,
        debug(...args) { logs.push(args) },
        createPromiseResolver() {},
        write(message) { messages.push(message) },
        async call(route, ...args) {
            const id = ++this.reqId
            this.debug('Calling', route, args)
            this.write({ id, route, args })
            return { ok: true }
        },
    }
    const logger = backend.debug
    const { sensitiveCall } = loadTs('src/lib/controllers/SensitiveCall.ts', {}, { window: { DeckyBackend: backend } })
    await sensitiveCall('authenticate_tab', 'account-a', 'unlock', 'private', 'ephemeral-test-input')
    assert.equal(logs.length, 0)
    assert.equal(backend.reqId, 8)
    assert.equal(messages[0].route, 'loader/call_plugin_method')
    assert.equal(backend.debug, logger)
    await backend.call('normal')
    assert.equal(logs.length, 1)
})

for (const protectedTab of [true, false]) {
    test(`leaving ${protectedTab ? 'a protected' : 'an unprotected'} tab applies the correct relock behavior`, () => {
        const cleanups = []
        const lockedIds = []
        const { TabGuard } = loadTs('src/components/locks/PinScreen.tsx', {
            '@decky/ui': { GamepadButton: {} },
            react: {
                useState: () => [0, () => {}],
                useEffect: setup => { const cleanup = setup(); if (cleanup) cleanups.push(cleanup) },
                Fragment: 'fragment',
            },
            'react-icons/fa': {},
        }, { window: { SP_REACT: { createElement: () => null } } })
        const locks = {
            revision: 0, events: new EventTarget(), isProtected: () => protectedTab,
            isLocked: () => false, lock: id => lockedIds.push(id),
        }
        TabGuard({ locks, id: 'tab', title: 'Tab', renderContent: () => null })
        assert.equal(lockedIds.length, 0)
        cleanups.forEach(cleanup => cleanup())
        assert.deepEqual(lockedIds, protectedTab ? ['tab'] : [])
    })
}
