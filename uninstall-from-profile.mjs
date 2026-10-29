#!/usr/bin/env node
/**
 * Roll back a dsh-plugin-agent-team-panel + dsh-plugin-composer-compact install
 * from one profile.
 *
 * Rollback is the inverse of install-into-profile.mjs, for both packages:
 *   1. remove the insert row this installer appended to the profile patch
 *      (<profile>/cordis.patch.yml), and
 *   2. remove <profile>/node_modules/<package-name> (a copy, or a junction to a
 *      working tree - a junction is unlinked, never followed).
 *
 * Safety:
 *   - --profile is required; the live desktop profile is refused unless
 *     --allow-desktop is passed explicitly;
 *   - the patch is backed up once before the edit and every .bak-* file is kept;
 *   - a node_modules entry is only removed when its package.json name matches;
 *   - blocks are removed exactly when they match the shape written by this
 *     repository, and by marker pattern otherwise; a plain "name:" mention in
 *     another shape is reported and left untouched;
 *   - no host process is started, restarted or killed.
 *
 * Usage:
 *   node uninstall-from-profile.mjs --profile <profile dir> [--patch <patch file>]
 *                                   [--dry-run] [--allow-desktop]
 *
 * Exit codes: 0 rolled back (or a clean dry run); 2 refused/failed.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/** Marker prefix/suffix must stay in sync with install-into-profile.mjs. */
const MARKER_PREFIX = '# dsh-agent-panel install: ';
const MARKER_SUFFIX = ' (install-into-profile.mjs)';

const REPO_ROOT = path.resolve(import.meta.dirname);

function parseArgs(argv) {
  const options = { profile: null, patch: null, dryRun: false, allowDesktop: false, help: false };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const take = () => {
      const value = argv[index + 1];
      if (value === undefined) throw new Error('missing value for ' + arg);
      index += 1;
      return value;
    };
    if (arg === '--profile') options.profile = path.resolve(take());
    else if (arg === '--patch') options.patch = path.resolve(take());
    else if (arg === '--dry-run') options.dryRun = true;
    else if (arg === '--allow-desktop') options.allowDesktop = true;
    else if (arg === '--help' || arg === '-h') options.help = true;
    else throw new Error('unknown argument: ' + arg);
  }
  if (options.help) return options;
  if (options.profile === null) throw new Error('--profile is required (there is deliberately no default profile)');
  if (!fs.existsSync(options.profile) || !fs.statSync(options.profile).isDirectory()) {
    throw new Error('profile directory does not exist: ' + options.profile);
  }
  return options;
}

function isLiveDesktopProfile(profileDir) {
  const resolved = path.resolve(profileDir);
  let live = null;
  try { live = path.resolve(os.homedir(), '.dsh', 'profiles', 'desktop'); } catch { live = null; }
  if (live !== null && resolved.toLowerCase() === live.toLowerCase()) return true;
  return path.basename(resolved).toLowerCase() === 'desktop';
}

function stamp() {
  return new Date().toISOString().replace(/[:.]/gu, '-');
}

function backupFile(file) {
  if (!fs.existsSync(file)) return null;
  const target = file + '.bak-' + stamp();
  fs.copyFileSync(file, target);
  return target;
}

function insertBlock(pkg) {
  return [
    '',
    MARKER_PREFIX + pkg.name + MARKER_SUFFIX,
    '- insert:',
    '    - id: ' + pkg.entryId,
    '      name: ' + JSON.stringify(pkg.name),
    '',
  ].join('\n');
}

/**
 * Remove the marker line plus the insert rows that follow it. Used when the
 * byte-exact block is absent (hand-edited indentation, CRLF conversion, ...).
 * The block is only removed when it mentions this package name.
 */
function removeBlockByMarker(text, pkg) {
  const marker = MARKER_PREFIX + pkg.name + MARKER_SUFFIX;
  const lines = text.split('\n');
  const markerIndex = lines.indexOf(marker);
  if (markerIndex < 0) return { changed: false, text, reason: 'marker-absent' };
  let start = markerIndex > 0 && lines[markerIndex - 1] === '' ? markerIndex - 1 : markerIndex;
  let end = markerIndex + 1;
  if (lines[end] !== undefined && lines[end].trim() === '- insert:') {
    end += 1;
    while (end < lines.length && (lines[end].startsWith('    ') || lines[end].startsWith('  '))) end += 1;
  }
  if (lines[end] === '') end += 1;
  const block = lines.slice(start, end).join('\n');
  if (!block.includes(JSON.stringify(pkg.name)) && !block.includes("'" + pkg.name + "'")) {
    return { changed: false, text, reason: 'name-absent-from-block' };
  }
  lines.splice(start, end - start);
  return { changed: true, text: lines.join('\n') };
}

function hasNameMention(text, name) {
  return text.includes('name: ' + JSON.stringify(name)) || text.includes("name: '" + name + "'");
}

function isLink(target) {
  try { return fs.lstatSync(target).isSymbolicLink(); } catch { return false; }
}

function readLinkResolved(target) {
  try {
    const raw = fs.readlinkSync(target);
    return path.isAbsolute(raw) ? path.resolve(raw) : path.resolve(path.dirname(target), raw);
  } catch { return null; }
}

function installedManifestName(target) {
  try { return JSON.parse(fs.readFileSync(path.join(target, 'package.json'), 'utf8')).name; } catch { return null; }
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    console.log('usage: node uninstall-from-profile.mjs --profile <profile dir> [--patch <patch file>] [--dry-run] [--allow-desktop]');
    return;
  }
  if (isLiveDesktopProfile(options.profile) && !options.allowDesktop) {
    throw new Error('refusing to roll back the live desktop profile (' + options.profile + '); pass --allow-desktop only if you really mean it');
  }

  const packages = ['primary', 'companion'].map((role) => {
    const dir = role === 'primary' ? REPO_ROOT : path.join(REPO_ROOT, 'companions', 'composer-compact');
    const manifestFile = path.join(dir, 'package.json');
    if (!fs.existsSync(manifestFile)) throw new Error(role + ': missing package.json at ' + manifestFile);
    const manifest = JSON.parse(fs.readFileSync(manifestFile, 'utf8'));
    if (typeof manifest.name !== 'string' || manifest.name.length === 0) throw new Error(role + ': package.json has no name');
    return { role, name: manifest.name, version: manifest.version, entryId: manifest.name.replace(/^dsh-plugin-/u, '') };
  });

  const patchFile = options.patch !== null ? options.patch : path.join(options.profile, 'cordis.patch.yml');
  const warnings = [];
  const steps = [];

  // ---- 1. profile patch: remove every block this repo wrote --------------
  let patchAction = 'present';
  let text = fs.existsSync(patchFile) ? fs.readFileSync(patchFile, 'utf8') : null;
  const patchBefore = text;
  const perPackage = [];
  if (text !== null) {
    for (const pkg of packages) {
      const exact = insertBlock(pkg);
      let action;
      if (text.includes(exact)) {
        text = text.replace(exact, '');
        action = 'removed';
      } else {
        const patterned = removeBlockByMarker(text, pkg);
        if (patterned.changed) {
          text = patterned.text;
          action = 'removed-by-marker';
        } else if (hasNameMention(text, pkg.name)) {
          action = 'kept-name-elsewhere';
          warnings.push('patch still mentions ' + pkg.name + ' in a shape this repository did not write; left untouched');
        } else {
          action = 'not-present';
        }
      }
      perPackage.push({ role: pkg.role, name: pkg.name, entryId: pkg.entryId, action });
    }
    const changed = text !== patchBefore;
    patchAction = changed ? 'removed' : 'unchanged';
    if (changed) {
      if (options.dryRun) {
        steps.push({ step: 'patch', file: patchFile, action: 'would-remove', dryRun: true });
      } else {
        const backup = backupFile(patchFile);
        fs.writeFileSync(patchFile, text, 'utf8');
        steps.push({ step: 'patch', file: patchFile, action: 'removed', backup });
      }
    }
  } else {
    patchAction = 'absent';
    for (const pkg of packages) perPackage.push({ role: pkg.role, name: pkg.name, entryId: pkg.entryId, action: 'patch-absent' });
  }

  // ---- 2. node_modules entries ------------------------------------------
  const nodeModules = [];
  for (const pkg of packages) {
    const target = path.join(options.profile, 'node_modules', pkg.name);
    const exists = fs.existsSync(target) || isLink(target);
    const item = { role: pkg.role, name: pkg.name, path: target, action: 'absent', link: null };
    if (exists) {
      const stat = fs.lstatSync(target);
      if (stat.isSymbolicLink()) {
        const linkTarget = readLinkResolved(target);
        item.link = { linkTarget, sourceStillThere: linkTarget === null ? null : fs.existsSync(linkTarget) };
        if (options.dryRun) {
          item.action = 'would-remove-junction';
        } else {
          try { fs.unlinkSync(target); } catch { try { fs.rmdirSync(target); } catch { /* best effort */ } }
          item.action = 'junction-removed';
        }
      } else {
        const name = installedManifestName(target);
        if (name !== pkg.name) {
          item.action = 'skipped-name-mismatch';
          warnings.push(target + ' contains package ' + String(name) + '; left untouched');
        } else if (options.dryRun) {
          item.action = 'would-remove-copy';
        } else {
          fs.rmSync(target, { recursive: true, force: true });
          item.action = 'copy-removed';
        }
      }
      if (item.action !== 'skipped-name-mismatch') {
        steps.push({ step: 'node_modules', role: pkg.role, path: target, action: item.action, dryRun: options.dryRun });
      }
    }
    nodeModules.push(item);
  }

  const patchDir = path.dirname(patchFile);
  const keptBackups = fs.existsSync(patchDir)
    ? fs.readdirSync(patchDir).filter((name) => name.startsWith(path.basename(patchFile) + '.bak-')).sort()
    : [];

  console.log(JSON.stringify({
    ok: true,
    dryRun: options.dryRun,
    repo: REPO_ROOT,
    profile: options.profile,
    desktopProfileGuard: isLiveDesktopProfile(options.profile) ? 'overridden-by-flag' : 'not-desktop',
    packages,
    patch: { file: patchFile, action: patchAction, packages: perPackage },
    nodeModules,
    steps,
    keptBackups,
    warnings,
    next: 'reload or restart the host that owns this profile. This script never starts, restarts or kills a host. Backups are kept on purpose; delete them manually once the rollback is accepted.',
  }, null, 2));
}

try {
  main();
} catch (error) {
  console.error(String((error && error.message) || error));
  process.exitCode = 2;
}
