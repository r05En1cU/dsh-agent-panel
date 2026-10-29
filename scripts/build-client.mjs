/**
 * Build the hand-written browser half from small source modules.
 *
 * No bundler, no node_modules in the browser: model/geometry are plain
 * functions with ESM export keywords stripped; client-body is the React
 * component + registration. The output is one ModuleLoader factory script.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const PLUGIN_ID = 'dsh-plugin-agent-team-panel';

function read(rel) {
  return fs.readFileSync(path.join(root, rel), 'utf8');
}

function stripEsm(source, rel) {
  if (/^\s*import\s/mu.test(source)) throw new Error(rel + ' must not use ESM imports');
  let out = source.replace(/^export\s+/gmu, '');
  out = out.replace(/^export\s*\{[^}]*\};?\s*$/gmu, '');
  if (/^\s*export\s/mu.test(out)) throw new Error(rel + ' has an unsupported export form');
  return out;
}

const model = stripEsm(read('src/model.mjs'), 'src/model.mjs');
const geometry = stripEsm(read('src/geometry.mjs'), 'src/geometry.mjs');
const body = read('src/client-body.js');

const output = '/* Built by scripts/build-client.mjs — do not edit by hand. */\n'
  + 'window.__ModuleLoader__.load({\n'
  + '  id: ' + JSON.stringify(PLUGIN_ID) + ',\n'
  + '  factory: (require) => {\n'
  + '    var module = { exports: {} };\n'
  + '    var exports = module.exports;\n'
  + '    const React = require("react");\n'
  + '    const el = React.createElement;\n'
  + model + '\n'
  + geometry + '\n'
  + body + '\n'
  + '    return module.exports;\n'
  + '  }\n'
  + '});\n';

fs.writeFileSync(path.join(root, 'client.js'), output, 'utf8');
console.log('built client.js', output.length, 'bytes');
