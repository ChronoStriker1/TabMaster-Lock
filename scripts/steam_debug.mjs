// Diagnostic bridge to Steam's existing CEF session through an SSH loopback tunnel.
// Reads a JavaScript expression from stdin. Never put credentials in expressions.
import { readFileSync, writeFileSync } from 'node:fs'

const endpoint = process.env.STEAM_DEBUG_ENDPOINT ?? 'http://127.0.0.1:18080'
const screenshotPath = process.argv[2] === '--screenshot' ? process.argv[3] : undefined
const title = screenshotPath ? 'Steam Big Picture Mode' : process.argv[2] ?? 'Steam Big Picture Mode'
const expression = screenshotPath ? '' : readFileSync(0, 'utf8')
const targets = await (await fetch(`${endpoint}/json/list`)).json()
const target = targets.find(target => target.title === title)
if (!target) throw new Error(`Steam target unavailable: ${title}`)
const socket = new WebSocket(target.webSocketDebuggerUrl)
const timer = setTimeout(() => { socket.close(); process.exitCode = 1 }, 20000)
await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject })
const response = new Promise(resolve => {
    socket.onmessage = ({ data }) => {
        const result = JSON.parse(data)
        if (result.id === 1) resolve(result)
    }
})
socket.send(JSON.stringify({ id: 1, method: screenshotPath ? 'Page.captureScreenshot' : 'Runtime.evaluate', params: screenshotPath
    ? { format: 'png' } : { expression, awaitPromise: true, returnByValue: true } }))
const result = await response
clearTimeout(timer)
socket.close()
if (result.error || result.result?.exceptionDetails) {
    console.error(JSON.stringify(result.error ?? result.result.exceptionDetails))
    process.exitCode = 1
} else if (screenshotPath) {
    writeFileSync(screenshotPath, Buffer.from(result.result.data, 'base64'))
    console.log(screenshotPath)
} else console.log(JSON.stringify(result.result?.result?.value ?? result.result))
