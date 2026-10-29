#!/usr/bin/env node
/**
 * Install dsh-plugin-agent-team-panel AND its companion dsh-plugin-composer-compact
 * into one DSH profile.
 *
 * A hand-built web-client package needs exactly two things per package:
 *   1. the package directory on the profile resolution path
 *      (<profile>/node_modules/<package-name>) - a copy, or --link for a junction
 *      to the working tree so source edits go live on reload;
 *   2. one "insert" row in the profile patch (<profile>/cordis.patch.yml), whose
 *      top level is a YAML array of loader patch entries. That row gives the web
 *      plugin table a Loader entry to scan for package.json "dsh.client"; the
 *      client half is then served as /plugins/<package-name>/client.js.
 *
 * Two packages, therefore two node_modules entries and two insert blocks. The
 * companion keeps its own package name, client registration id and behaviour
 * (see companions/composer-compact/README.md); this installer only places it.
 *
 * Safety:
 *   - --profile is required; there is deliberately no implicit default profile;
 *   - the user's live desktop profile is refused unless --allow-desktop is passed
 *     explicitly (this repository never installs into it);
 *   - the profile patch is backed up once as cordis.patch.yml.bak-<UTC> before
 *     any appended block; backups are kept (rollback never deletes them);
 *   - re-running is idempotent: an unchanged copy is reported "up-to-date", a
 *     junction that already points at the working tree is not re-created, and a
 *     block already present is never appended twice;
 *   - a node_modules entry whose package.json name differs is never replaced
 *     unless --force is given;
 *   - no host process is started, restarted or killed. Reload/restart the host
 *     yourself after this script exits.
 *
 * Usage:
 *   node install-into-profile.mjs --profile <profile dir> [--patch <patch file>]
 *                                 [--link] [--dry-run] [--allow-desktop]
 *                                 [--force] [--require-complete]
 *
 * Example (isolated viewer profile):
 *   node install-into-profile.mjs --profile "D:\viewer\home\profiles\viewer" --link
 *
 * Exit codes: 0 installed (or a clean dry run); 2 refused/failed; 3 installed but
 * degraded (a build artifact of the primary package is missing - run the build
 * first; --require-complete turns that into 2).
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';

/** Marker prefix/suffix must stay in sync with uninstall-from-profile.mjs. */
const MARKER_PREFIX = '# dsh-agent-panel install: ';
const MARKER_SUFFIX = ' (install-into-profile.mjs)';
const IGNORED_DIR_NAMES = new Set(['.git', 'node_modules', '.cache', '.pnpm-store']);
const IGNORED_FILE_SUFFIX = '.bak-';

const REPO_ROOT = path.resolve(import.meta.dirname);

function parseArgs(argv) {
  const options = {
    profile: null,
    patch: null,
    link: false,
    dryRun: false,
    allowDesktop: false,
    force: false,
    requireComplete: false,
    help: false,
  };
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
    else if (arg === '--link') options.link = true;
    else if (arg === '--dry-run') options.dryRun = true;
    else if (arg === '--allow-desktop') options.allowDesktop = true;
    else if (arg === '--force') options.force = true;
    else if (arg === '--require-complete') options.requireComplete = true;
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

/** The user's live desktop profile is the one profile this repository never touches. */
function isLiveDesktopProfile(profileDir) {
  const resolved = path.resolve(profileDir);
  let live = null;
  try { live = path.resolve(os.homedir(), '.dsh', 'profiles', 'desktop'); } catch { live = null; }
  if (live !== null && resolved.toLowerCase() === live.toLowerCase()) return true;
  return path.basename(resolved).toLowerCase() === 'desktop';
}

function toPosix(relative) {
  return relative.split(path.sep).join('/');
}

function isIgnoredFile(name) {
  return name.includes(IGNORED_FILE_SUFFIX);
}

/**
 * Read and validate one package the installer is responsible for.
 * Hard errors are identity problems (no name, not a web client row); missing
 * build artifacts are reported as degraded instead, because a checkout that has
 * not been built yet is a state of the source tree, not an installer bug.
 */
function loadPackage(dir, role) {
  const manifestFile = path.join(dir, 'package.json');
  if (!fs.existsSync(manifestFile)) throw new Error(role + ': missing package.json at ' + manifestFile);
  const manifest = JSON.parse(fs.readFileSync(manifestFile, 'utf8'));
  const name = manifest.name;
  if (typeof name !== 'string' || name.length === 0) throw new Error(role + ': package.json has no name');
  if (manifest.dsh === undefined || manifest.dsh.client === undefined) throw new Error(name + ': package.json has no dsh.client declaration');
  if (manifest.dsh.client.platform !== 'web') throw new Error(name + ': dsh.client.platform must be "web"');
  const clientExport = manifest.exports && manifest.exports['./client'];
  if (typeof clientExport !== 'string') throw new Error(name + ': exports["./client"] must be a string');
  const clientRel = clientExport.replace(/^\.\//u, '');
  const mainRel = typeof manifest.main === 'string' ? manifest.main.replace(/^\.\//u, '') : null;
  const problems = [];
  if (!fs.existsSync(path.join(dir, clientRel))) problems.push('client artifact missing: ' + clientRel);
  if (mainRel !== null && !fs.existsSync(path.join(dir, mainRel))) problems.push('host half missing: ' + mainRel);
  return {
    role,
    dir,
    name,
    version: manifest.version,
    manifest,
    entryId: name.replace(/^dsh-plugin-/u, ''),
    clientRel,
    mainRel,
    missingArtifacts: problems,
  };
}

/** The install payload is exactly package.json "files" (npm semantics), plus package.json. */
function packagePayload(pkg) {
  const listed = Array.isArray(pkg.manifest.files) && pkg.manifest.files.length > 0 ? pkg.manifest.files : null;
  const files = [];
  const walk = (absDir, relDir) => {
    for (const entry of fs.readdirSync(absDir, { withFileTypes: true })) {
      const name = entry.name;
      if (entry.isDirectory()) {
        if (IGNORED_DIR_NAMES.has(name)) continue;
        walk(path.join(absDir, name), relDir === '' ? name : relDir + '/' + name);
        continue;
      }
      if (!entry.isFile()) continue;
      if (isIgnoredFile(name)) continue;
      files.push(relDir === '' ? name : relDir + '/' + name);
    }
  };
  if (listed !== null) {
    for (const entry of listed) {
      const rel = toPosix(String(entry)).replace(/\/+$/u, '');
      const abs = path.join(pkg.dir, rel);
      if (!fs.existsSync(abs)) continue;
      const stat = fs.statSync(abs);
      if (stat.isDirectory()) walk(abs, rel);
      else if (stat.isFile()) files.push(rel);
    }
  } else {
    walk(pkg.dir, '');
  }
  if (!files.includes('package.json')) files.push('package.json');
  return Array.from(new Set(files)).sort();
}

/** Stable content digest of the payload; used to prove "up-to-date" instead of re-copying. */
function payloadDigest(pkg, files) {
  const hash = crypto.createHash('sha256');
  for (const rel of files) {
    const content = fs.readFileSync(path.join(pkg.dir, rel));
    hash.update(rel + '\u0000' + String(content.length) + '\u0000');
    hash.update(content);
    hash.update('\u0001');
  }
  return hash.digest('hex');
}

/** Digest of an installed copy, read through the same payload list. */
function installedDigest(target, files) {
  const hash = crypto.createHash('sha256');
  for (const rel of files) {
    const abs = path.join(target, rel);
    if (!fs.existsSync(abs)) return null;
    const content = fs.readFileSync(abs);
    hash.update(rel + '\u0000' + String(content.length) + '\u0000');
    hash.update(content);
    hash.update('\u0001');
  }
  return hash.digest('hex');
}

function copyPayload(pkg, files, target) {
  for (const rel of files) {
    const from = path.join(pkg.dir, rel);
    const to = path.join(target, rel);
    fs.mkdirSync(path.dirname(to), { recursive: true });
    fs.copyFileSync(from, to);
  }
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

function samePath(a, b) {
  return path.resolve(a).toLowerCase() === path.resolve(b).toLowerCase();
}

/** Remove a previous install without ever following a junction into its source. */
function removeInstalledPath(target) {
  if (!fs.existsSync(target) && !isLink(target)) return { removed: false, reason: 'absent' };
  const stat = fs.lstatSync(target);
  if (stat.isSymbolicLink()) {
    const linkTarget = readLinkResolved(target);
    try { fs.unlinkSync(target); } catch { try { fs.rmdirSync(target); } catch { /* best effort */ } }
    return { removed: true, mode: 'junction', linkTarget };
  }
  fs.rmSync(target, { recursive: true, force: true });
  return { removed: true, mode: 'copy' };
}

function installedManifestName(target) {
  try { return JSON.parse(fs.readFileSync(path.join(target, 'package.json'), 'utf8')).name; } catch { return null; }
}

/** One append-only YAML array item per package. */
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

function stamp() {
  return new Date().toISOString().replace(/[:.]/gu, '-');
}

function backupFile(file) {
  if (!fs.existsSync(file)) return null;
  const target = file + '.bak-' + stamp();
  fs.copyFileSync(file, target);
  return target;
}

function hasNameMention(text, name) {
  return text.includes('name: ' + JSON.stringify(name)) || text.includes("name: '" + name + "'");
}

/** Plan + apply one package (node_modules side); the patch side is batched below. */
function installPackage(pkg, options, files, digest, steps) {
  const target = path.join(options.profile, 'node_modules', pkg.name);
  const entry = {
    role: pkg.role,
    name: pkg.name,
    version: pkg.version,
    source: pkg.dir,
    target,
    files: files.length,
    digest,
    client: pkg.clientRel,
    action: null,
  };

  const exists = fs.existsSync(target) || isLink(target);
  if (exists) {
    const stat = fs.lstatSync(target);
    if (stat.isSymbolicLink()) {
      const linkTarget = readLinkResolved(target);
      if (options.link && linkTarget !== null && samePath(linkTarget, pkg.dir)) {
        entry.action = 'up-to-date';
        entry.linkTarget = linkTarget;
        steps.push({ step: 'node_modules', role: pkg.role, name: pkg.name, action: 'up-to-date', mode: 'junction', path: target, linkTarget });
        return entry;
      }
      if (!options.dryRun) {
        const previous = removeInstalledPath(target);
        steps.push({ step: 'node_modules:remove-previous', role: pkg.role, name: pkg.name, ...previous });
      }
      entry.action = options.link ? 'relinked' : 'refreshed';
    } else {
      const name = installedManifestName(target);
      if (name !== pkg.name && !options.force) {
        throw new Error('refusing to replace ' + target + ': it contains package "' + String(name) + '", not "' + pkg.name + '" (pass --force to replace it)');
      }
      if (!options.link) {
        const installed = installedDigest(target, files);
        if (installed !== null && installed === digest) {
          entry.action = 'up-to-date';
          steps.push({ step: 'node_modules', role: pkg.role, name: pkg.name, action: 'up-to-date', mode: 'copy', path: target, digest });
          return entry;
        }
      }
      if (!options.dryRun) {
        const previous = removeInstalledPath(target);
        steps.push({ step: 'node_modules:remove-previous', role: pkg.role, name: pkg.name, ...previous });
      }
      entry.action = options.link ? 'linked' : 'refreshed';
    }
  } else {
    entry.action = options.link ? 'linked' : 'installed';
  }

  if (options.dryRun) {
    entry.action = 'would-' + entry.action;
    steps.push({ step: 'node_modules', role: pkg.role, name: pkg.name, action: entry.action, mode: options.link ? 'junction' : 'copy', from: pkg.dir, to: target, dryRun: true });
    return entry;
  }

  fs.mkdirSync(path.dirname(target), { recursive: true });
  if (options.link) {
    fs.symlinkSync(pkg.dir, target, 'junction');
    entry.linkTarget = pkg.dir;
  } else {
    copyPayload(pkg, files, target);
  }
  const installedName = installedManifestName(target);
  if (installedName !== pkg.name) throw new Error('installed manifest name mismatch: ' + String(installedName));
  steps.push({ step: 'node_modules', role: pkg.role, name: pkg.name, action: entry.action, mode: options.link ? 'junction' : 'copy', from: pkg.dir, to: target });
  return entry;
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    console.log('usage: node install-into-profile.mjs --profile <profile dir> [--patch <patch file>] [--link] [--dry-run] [--allow-desktop] [--force] [--require-complete]');
    return;
  }
  if (isLiveDesktopProfile(options.profile) && !options.allowDesktop) {
    throw new Error('refusing to install into the live desktop profile (' + options.profile + '); pass --allow-desktop only if you really mean it');
  }

  const companionsRoot = path.join(REPO_ROOT, 'companions', 'composer-compact');
  const packages = [
    loadPackage(REPO_ROOT, 'primary'),
    loadPackage(companionsRoot, 'companion'),
  ];
  const names = new Set();
  for (const pkg of packages) {
    if (names.has(pkg.name)) throw new Error('duplicate package name in install set: ' + pkg.name);
    names.add(pkg.name);
  }
  const entryIds = new Set(packages.map((pkg) => pkg.entryId));
  if (entryIds.size !== packages.length) throw new Error('duplicate loader entry id in install set');

  const warnings = [];
  const steps = [];
  const patchFile = options.patch !== null ? options.patch : path.join(options.profile, 'cordis.patch.yml');

  const entries = [];
  for (const pkg of packages) {
    const files = packagePayload(pkg);
    const digest = payloadDigest(pkg, files);
    for (const problem of pkg.missingArtifacts) warnings.push(pkg.name + ': ' + problem + ' (run the package build; the loader row will fail until it exists)');
    entries.push({ pkg, files, digest, entry: installPackage(pkg, options, files, digest, steps) });
  }

  // ---- profile patch: one backup, N blocks, never a duplicate -----------
  const existing = fs.existsSync(patchFile) ? fs.readFileSync(patchFile, 'utf8') : '';
  const appended = [];
  const alreadyPresent = [];
  const presentOtherShape = [];
  let appendedText = '';
  for (const { pkg } of entries) {
    const block = insertBlock(pkg);
    if ((existing + appendedText).includes(block)) {
      alreadyPresent.push({ role: pkg.role, name: pkg.name, entryId: pkg.entryId });
      continue;
    }
    if (hasNameMention(existing, pkg.name)) {
      presentOtherShape.push({ role: pkg.role, name: pkg.name });
      warnings.push(pkg.name + ': the profile patch already mentions this name in another shape; left untouched (no duplicate row appended)');
      continue;
    }
    appended.push({ role: pkg.role, name: pkg.name, entryId: pkg.entryId, bytes: Buffer.byteLength(block), block });
    appendedText += block;
  }

  let backup = null;
  if (appended.length > 0) {
    if (options.dryRun) {
      steps.push({ step: 'patch', file: patchFile, dryRun: true, append: appended.map(({ role, name, entryId, bytes }) => ({ role, name, entryId, bytes })) });
    } else {
      fs.mkdirSync(path.dirname(patchFile), { recursive: true });
      backup = backupFile(patchFile);
      fs.appendFileSync(patchFile, appendedText, 'utf8');
      steps.push({ step: 'patch', file: patchFile, append: appended.map(({ role, name, entryId, bytes }) => ({ role, name, entryId, bytes })), backup });
    }
  }

  const degraded = entries.some(({ pkg }) => pkg.missingArtifacts.length > 0);
  console.log(JSON.stringify({
    ok: true,
    dryRun: options.dryRun,
    degraded,
    repo: REPO_ROOT,
    profile: options.profile,
    desktopProfileGuard: isLiveDesktopProfile(options.profile) ? 'overridden-by-flag' : 'not-desktop',
    mode: options.link ? 'junction' : 'copy',
    packages: entries.map(({ entry }) => entry),
    patch: {
      file: patchFile,
      backup,
      appended: appended.map(({ role, name, entryId, bytes }) => ({ role, name, entryId, bytes })),
      alreadyPresent,
      presentOtherShape,
      bytesAdded: Buffer.byteLength(appendedText),
      blocks: appended.map(({ block }) => block),
    },
    steps,
    warnings,
    next: 'reload or restart the host that owns this profile; the web plugin table scans dsh.client rows at activation. This script never starts, restarts or kills a host. Re-running it is idempotent.',
  }, null, 2));

  if (!options.dryRun && degraded) process.exitCode = options.requireComplete ? 2 : 3;
}

try {
  main();
} catch (error) {
  console.error(String((error && error.message) || error));
  process.exitCode = 2;
}
