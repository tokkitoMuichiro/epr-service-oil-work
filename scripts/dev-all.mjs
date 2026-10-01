import { spawn } from 'node:child_process'

const workspaces = ['server', 'client']

const children = workspaces.map((workspace) => {
  const child = spawn(`npm run dev --workspace=${workspace}`, {
    stdio: ['ignore', 'pipe', 'pipe'],
    shell: true,
  })
  const prefix = `[${workspace}] `
  const forward = (target) => (chunk) => {
    const lines = chunk.toString().split(/\r?\n/).filter(Boolean)
    for (const line of lines) target.write(`${prefix}${line}\n`)
  }
  child.stdout.on('data', forward(process.stdout))
  child.stderr.on('data', forward(process.stderr))
  child.on('exit', (code) => {
    console.log(`${prefix}завершён с кодом ${code}`)
    shutdown(code ?? 0)
  })
  return child
})

let stopping = false
function shutdown(code) {
  if (stopping) return
  stopping = true
  for (const child of children) {
    if (child.exitCode === null) child.kill()
  }
  process.exit(code)
}

process.on('SIGINT', () => shutdown(0))
process.on('SIGTERM', () => shutdown(0))
