import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as esbuild from 'esbuild';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');
const DIST = path.join(ROOT, 'dist');

fs.mkdirSync(DIST, { recursive: true });

// 1. Bundle inline MCP App UI into a self-contained single-file HTML document.
const uiBuild = await esbuild.build({
  entryPoints: [path.join(ROOT, 'src', 'inline.ts')],
  bundle: true,
  format: 'esm',
  platform: 'browser',
  target: 'es2022',
  minify: true,
  write: false,
});

const inlineJs = uiBuild.outputFiles[0].text.replace(/<\/script>/gi, '<\\/script>');

const INLINE_CSS = `
  *, *::before, *::after { box-sizing: border-box; }
  html, body {
    margin: 0;
    padding: 0;
    background: transparent;
    color: var(--color-text-primary, #1f1f1f);
    font-family: var(--font-sans, system-ui, -apple-system, sans-serif);
    font-size: 13px;
    line-height: 1.4;
    -webkit-font-smoothing: antialiased;
  }
  .wrap {
    padding: 4px 2px 6px;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .header-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    flex-wrap: wrap;
  }
  .heading {
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: var(--color-text-tertiary, #6b7280);
  }
  .header-controls {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-left: auto;
  }
  .mode-toggle {
    appearance: none;
    border: 1px solid var(--color-border-primary, rgba(128,128,128,0.28));
    background: transparent;
    color: var(--color-text-secondary, #52525b);
    font-family: inherit;
    font-size: 11px;
    font-weight: 500;
    padding: 2px 8px;
    border-radius: 9999px;
    cursor: pointer;
    transition: background-color 0.12s ease, border-color 0.12s ease, color 0.12s ease;
  }
  .mode-toggle:hover {
    background: var(--color-background-secondary, rgba(128,128,128,0.1));
    color: var(--color-text-primary, #1f1f1f);
  }
  .mode-toggle.is-active {
    background: var(--color-background-info, rgba(59, 130, 246, 0.14));
    border-color: var(--color-border-info, #3b82f6);
    color: var(--color-text-info, #2563eb);
  }
  .hint {
    font-size: 11px;
    color: var(--color-text-tertiary, #6b7280);
    opacity: 0.78;
  }
  .pill-row {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px;
  }

  /* Split reply pill container */
  .pill-group {
    display: inline-flex;
    align-items: stretch;
    border-radius: 9999px;
    border: 1px solid var(--color-border-primary, rgba(128,128,128,0.28));
    background: var(--color-background-secondary, rgba(128,128,128,0.08));
    color: var(--color-text-primary, #1f1f1f);
    overflow: hidden;
    transition: transform 0.08s ease, background-color 0.12s ease, border-color 0.12s ease, box-shadow 0.12s ease, opacity 0.12s ease;
  }
  .pill-group:hover {
    border-color: var(--color-border-info, #3b82f6);
    transform: translateY(-0.5px);
  }
  .pill-group.pill-primary {
    background: var(--color-background-inverse, #18181b);
    color: var(--color-text-inverse, #ffffff);
    border-color: transparent;
  }
  .pill-group.pill-primary:hover {
    border-color: transparent;
    opacity: 0.94;
  }
  .pill-group.pill-subtle {
    background: transparent;
    color: var(--color-text-secondary, #52525b);
  }
  .pill-group.is-selected {
    border-color: var(--color-border-info, #3b82f6);
    background: var(--color-background-info, rgba(59, 130, 246, 0.14));
    color: var(--color-text-primary, #1f1f1f);
    box-shadow: 0 0 0 1px var(--color-border-info, #3b82f6);
  }
  .pill-group.is-sent {
    background: var(--color-background-success, rgba(22, 163, 74, 0.14));
    color: var(--color-text-success, #15803d);
    border-color: var(--color-border-success, rgba(22, 163, 74, 0.35));
  }
  .pill-group.is-editing {
    border-color: var(--color-border-info, #3b82f6);
    box-shadow: 0 0 0 1px var(--color-border-info, #3b82f6);
  }
  .pill-group.is-attached {
    border-color: var(--color-border-info, #3b82f6);
    background: var(--color-background-info, rgba(59, 130, 246, 0.12));
  }
  .pill-group.is-sending {
    opacity: 0.72;
  }

  .pill-main {
    appearance: none;
    display: inline-flex;
    align-items: center;
    gap: 5px;
    padding: 5.5px 11px;
    border: none;
    background: transparent;
    color: inherit;
    font-family: inherit;
    font-size: 12.5px;
    font-weight: 500;
    cursor: pointer;
  }
  .pill-main:disabled { cursor: default; }

  .pill-bg-btn {
    appearance: none;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 0 8px 0 6px;
    border: none;
    border-left: 1px solid rgba(128, 128, 128, 0.22);
    background: transparent;
    color: inherit;
    font-family: inherit;
    font-size: 11px;
    cursor: pointer;
    opacity: 0.58;
    transition: opacity 0.12s ease, background-color 0.12s ease;
  }
  .pill-bg-btn.is-recommended { opacity: 0.9; }
  .pill-group:hover .pill-bg-btn,
  .pill-bg-btn:focus-visible { opacity: 0.95; }
  .pill-bg-btn:hover:not(:disabled) { background: rgba(128, 128, 128, 0.18); }
  .pill-group.pill-primary .pill-bg-btn { border-left-color: rgba(255, 255, 255, 0.22); }
  .pill-group.pill-primary .pill-bg-btn:hover:not(:disabled) { background: rgba(255, 255, 255, 0.14); }
  .pill-group.is-forked .pill-bg-btn {
    opacity: 1;
    color: var(--color-text-success, #15803d);
  }
  .pill-bg-btn:disabled { cursor: default; }

  .pill-check {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 14px;
    height: 14px;
    border-radius: 4px;
    border: 1.5px solid currentColor;
    font-size: 10px;
    line-height: 1;
    opacity: 0.7;
  }
  .pill-check.checked {
    background: var(--color-border-info, #3b82f6);
    border-color: var(--color-border-info, #3b82f6);
    color: #ffffff;
    opacity: 1;
  }

  /* File & URL action pills */
  .pill {
    appearance: none;
    display: inline-flex;
    align-items: center;
    gap: 5px;
    padding: 5.5px 11px;
    border-radius: 9999px;
    border: 1px dashed var(--color-border-primary, rgba(128,128,128,0.34));
    background: transparent;
    color: var(--color-text-secondary, #52525b);
    font-family: inherit;
    font-size: 12.5px;
    font-weight: 500;
    cursor: pointer;
    transition: transform 0.08s ease, background-color 0.12s ease, border-color 0.12s ease, color 0.12s ease;
  }
  .pill:hover:not(:disabled) {
    background: var(--color-background-secondary, rgba(128,128,128,0.1));
    border-style: solid;
    border-color: var(--color-border-info, #3b82f6);
    color: var(--color-text-primary, #1f1f1f);
    transform: translateY(-0.5px);
  }
  .pill.is-opened {
    border-style: solid;
    border-color: var(--color-border-success, rgba(22, 163, 74, 0.35));
    background: var(--color-background-success, rgba(22, 163, 74, 0.1));
    color: var(--color-text-success, #15803d);
  }
  .pill:disabled { cursor: default; opacity: 0.7; }
  .pill-icon { font-size: 11.5px; }
  .pill-arrow { font-size: 11px; opacity: 0.6; }

  /* Multi-select batch bar */
  .batch-bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    flex-wrap: wrap;
    padding: 6px 10px;
    border-radius: 10px;
    border: 1px solid var(--color-border-info, rgba(59, 130, 246, 0.4));
    background: var(--color-background-info, rgba(59, 130, 246, 0.08));
  }
  .batch-count {
    font-size: 12px;
    font-weight: 600;
    color: var(--color-text-info, #2563eb);
  }

  /* Inline editor */
  .editor {
    display: flex;
    flex-direction: column;
    gap: 6px;
    margin-top: 2px;
    padding: 8px 10px;
    border-radius: 10px;
    border: 1px solid var(--color-border-primary, rgba(128,128,128,0.28));
    background: var(--color-background-secondary, rgba(128,128,128,0.06));
  }
  .draft-input {
    width: 100%;
    resize: none;
    border: none;
    outline: none;
    background: transparent;
    color: var(--color-text-primary, #1f1f1f);
    font-family: inherit;
    font-size: 13px;
    line-height: 1.45;
    padding: 0;
  }
  .editor-actions {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    flex-wrap: wrap;
  }
  .editor-hint {
    font-size: 11px;
    color: var(--color-text-tertiary, #6b7280);
  }
  .editor-buttons {
    display: flex;
    align-items: center;
    gap: 6px;
    flex-wrap: wrap;
    margin-left: auto;
  }
  .action-btn {
    appearance: none;
    padding: 4px 10px;
    border-radius: 9999px;
    border: 1px solid var(--color-border-primary, rgba(128,128,128,0.28));
    background: transparent;
    color: var(--color-text-primary, #1f1f1f);
    font-family: inherit;
    font-size: 12px;
    font-weight: 500;
    cursor: pointer;
  }
  .action-btn:hover:not(:disabled) {
    background: var(--color-background-tertiary, rgba(128,128,128,0.14));
  }
  .action-btn:disabled { cursor: default; opacity: 0.65; }
  .action-send {
    background: var(--color-background-inverse, #18181b);
    color: var(--color-text-inverse, #ffffff);
    border-color: transparent;
  }
  .action-send:hover:not(:disabled) {
    background: var(--color-background-inverse, #18181b);
    opacity: 0.9;
  }

  .preview {
    min-height: 16px;
    font-size: 11.5px;
    color: var(--color-text-tertiary, #6b7280);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    opacity: 0;
    transition: opacity 0.12s ease;
  }
  .preview.visible { opacity: 1; }
  .status-note {
    font-size: 12px;
    color: var(--color-text-tertiary, #6b7280);
  }
  .status-note.error {
    color: var(--color-text-danger, #dc2626);
  }
`;

const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Quick Replies</title>
  <style>${INLINE_CSS}</style>
</head>
<body>
  <div id="app"></div>
  <script type="module">${inlineJs}</script>
</body>
</html>
`;

fs.writeFileSync(path.join(DIST, 'inline.html'), html, 'utf8');

// 2. Bundle MCP stdio server into a self-contained ESM file so end users need zero npm install.
await esbuild.build({
  entryPoints: [path.join(ROOT, 'src', 'server.mjs')],
  bundle: true,
  format: 'esm',
  platform: 'node',
  target: 'node20',
  minify: true,
  outfile: path.join(DIST, 'server.mjs'),
  banner: {
    js: 'import { createRequire as __createRequire } from "node:module"; const require = __createRequire(import.meta.url);',
  },
});

console.log('Built dist/inline.html and dist/server.mjs');
