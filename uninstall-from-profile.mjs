#!/usr/bin/env node
/**
 * Remove dsh-agent-panel from a DSH profile: delete the managed loader block and the
 * two plugin package directories. The profile patch is backed up before rewriting.
 *
 * Usage:
 *   node uninstall-from-profile.mjs --profile "<profile directory>" [--dry-run] [--allow-desktop]
 */
import { copyFileSync, existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const MARK_START = '# >>> dsh-agent-panel install (managed)'
const MARK_END = '# <<< dsh-agent-panel install (managed)'
const PACKAGES = ['dsh-experimental-collaboration-records', 'dsh-experimental-client-ui-project-space']

function parseArgs(argv) {
  const options = { profile: null, dryRun: false, allowDesktop: false }
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === '--profile') { options.profile = argv[index + 1]; index += 1 }
    else if (arg === '--dry-run') options.dryRun = true
    else if (arg === '--allow-desktop') options.allowDesktop = true
    else if (arg === '--help' || arg === '-h') options.help = true
    else throw new Error('unknown argument: ' + arg)
  }
  if (!options.help && !options.profile) throw new Error('--profile is required')
  return options
}

const options = parseArgs(process.argv.slice(2))
if (options.help) {
  console.log('usage: node uninstall-from-profile.mjs --profile "<profile directory>" [--dry-run] [--allow-desktop]')
  process.exit(0)
}
const profile = resolve(options.profile)
if (!existsSync(profile)) throw new Error('profile directory does not exist: ' + profile)
const live = resolve(homedir(), '.dsh', 'profiles', 'desktop')
if (profile.toLowerCase() === live.toLowerCase() && !options.allowDesktop) {
  throw new Error('refusing the live desktop profile without --allow-desktop')
}
const patchPath = join(profile, 'cordis.patch.yml')
if (existsSync(patchPath)) {
  const text = readFileSync(patchPath, 'utf8')
  const start = text.indexOf(MARK_START)
  if (start !== -1) {
    const end = text.indexOf(MARK_END, start)
    if (end === -1) throw new Error('managed block marker start found without its end marker')
    const next = (text.slice(0, start) + text.slice(end + MARK_END.length).replace(/^\r?\n/, '')).replace(/\s*$/, '') + '\n'
    if (options.dryRun) console.log('[dry-run] would rewrite ' + patchPath)
    else {
      const stamp = new Date().toISOString().replace(/[:.]/g, '-')
      copyFileSync(patchPath, patchPath + '.bak-' + stamp)
      writeFileSync(patchPath, next, 'utf8')
      console.log('removed managed loader block from ' + patchPath)
    }
  } else console.log('no managed loader block found in ' + patchPath)
}
for (const dir of PACKAGES) {
  const target = join(profile, 'node_modules', '@deepseek-ai', dir)
  if (options.dryRun) { if (existsSync(target)) console.log('[dry-run] would remove ' + target); continue }
  if (existsSync(target)) { rmSync(target, { recursive: true, force: true }); console.log('removed ' + target) }
}
console.log('restart or reload the DSH host to apply.')
