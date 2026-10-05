// Lint config. The game's classic scripts share one global scope (loaded in index.html order), so every top-level
// name they declare is a global for the other files; the 3D renderer (.mjs) is ES modules that also read them.
import js from '@eslint/js';
import globals from 'globals';
import fs from 'node:fs';
import * as espree from 'espree';

const html = fs.readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const scripts = [...html.matchAll(/<script src="([^"]+)"/g)].map(m => m[1]);
const shared = {};
for (const f of scripts) {
  const ast = espree.parse(fs.readFileSync(new URL('./' + f, import.meta.url), 'utf8'), { ecmaVersion: 2023, sourceType: 'script' });
  for (const n of ast.body)
    if (n.type === 'VariableDeclaration')
      for (const d of n.declarations)
        if (d.id.type === 'ObjectPattern') for (const q of d.id.properties) shared[q.value.name] = 'writable';
        else shared[d.id.name] = 'writable';
    else if ((n.type === 'FunctionDeclaration' || n.type === 'ClassDeclaration') && n.id) shared[n.id.name] = 'writable';
}

export default [
  { ignores: ['node_modules/**', 'assets/**'] },
  js.configs.recommended,
  {
    files: ['js/**/*.js'],
    languageOptions: { ecmaVersion: 2023, sourceType: 'script', globals: { ...globals.browser, ...shared } },
    rules: {
      'no-unused-vars': ['warn', { vars: 'local', args: 'none', caughtErrors: 'none' }],
      'no-redeclare': 'off' // one shared global scope: the declaring file and the users see the same names
    }
  },
  {
    files: ['js/**/*.mjs'],
    languageOptions: { ecmaVersion: 2023, sourceType: 'module', globals: { ...globals.browser, ...shared } },
    rules: { 'no-unused-vars': ['warn', { args: 'none', caughtErrors: 'none' }] }
  },
  { files: ['eslint.config.mjs'], languageOptions: { sourceType: 'module', globals: globals.node } },
  {
    files: ['tests/**/*.js'],
    languageOptions: { ecmaVersion: 2023, sourceType: 'commonjs', globals: { ...globals.node } }
  },
  // the UI smoke test's page.evaluate callbacks run in the page: the browser and the game's shared globals too
  {
    files: ['tests/ui-smoke.js'],
    languageOptions: { ecmaVersion: 2023, sourceType: 'commonjs', globals: { ...globals.node, ...globals.browser, ...shared } }
  }
];
