import {
  App,
  applyDocumentTheme,
  applyHostStyleVariables,
} from '@modelcontextprotocol/ext-apps';
import { z } from 'zod';

type PillKind = 'reply' | 'file' | 'url';

interface PillOption {
  id?: string;
  kind?: PillKind;
  label: string;
  prompt?: string;
  fileUri?: string;
  url?: string;
  tone?: 'primary' | 'default' | 'subtle';
  background?: boolean;
}

interface InlinePayload {
  heading?: string;
  replies?: PillOption[];
}

const ToggleAuxPaneResultSchema = z
  .object({
    isError: z.boolean().optional(),
  })
  .passthrough();

const app = new App({ name: 'Quick Replies Inline', version: '1.3.1' }, {});

let currentPayload: InlinePayload = { heading: '', replies: [] };
let canSend = true;
let canUpdateContext = false;
let canOpenLinks = true;

let multiSelectMode = false;
let selectedIndices = new Set<number>();

let sendingKey: string | null = null;
let sentKeys = new Set<string>();
let forkedKeys = new Set<string>();
let openedKeys = new Set<string>();
let attachedKey: string | null = null;

let editingTarget: { mode: 'single'; index: number } | { mode: 'batch' } | null = null;
let draftText = '';

let statusText = '';
let statusIsError = false;
let hoveredPreview = '';

const root = document.getElementById('app')!;

function getKind(item: PillOption): PillKind {
  if (item.kind === 'file' || item.kind === 'url' || item.kind === 'reply') return item.kind;
  if (item.fileUri && !item.prompt) return 'file';
  if (item.url && !item.prompt) return 'url';
  return 'reply';
}

function createReplyLeadingIcon(label: string): HTMLElement | null {
  if (/\b(commit|push|ship)\b/i.test(label)) {
    const el = document.createElement('span');
    el.className = 'pill-icon';
    el.setAttribute('aria-hidden', 'true');
    el.textContent = '🚀';
    return el;
  }
  if (/\barchive\b/i.test(label)) {
    const el = document.createElement('span');
    el.className = 'pill-icon pill-icon-svg';
    el.setAttribute('aria-hidden', 'true');
    el.innerHTML =
      '<svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="1.5" y="2.5" width="13" height="3" rx="0.8"/><path d="M2.5 5.5V12.5C2.5 13.05 2.95 13.5 3.5 13.5H12.5C13.05 13.5 13.5 13.05 13.5 12.5V5.5"/><path d="M6.5 8.5H9.5"/></svg>';
    return el;
  }
  return null;
}

function getPrompt(item: PillOption): string {
  return (item.prompt ?? item.label).trim();
}

function formatFileLabel(uri: string): string {
  try {
    return decodeURIComponent(uri.replace(/^file:\/\//, ''));
  } catch {
    return uri;
  }
}

function applyTheme(ctx: ReturnType<App['getHostContext']>) {
  if (!ctx) return;
  if (ctx.theme) applyDocumentTheme(ctx.theme);
  if (ctx.styles?.variables) applyHostStyleVariables(ctx.styles.variables);
}

function updatePreview(text: string) {
  hoveredPreview = text;
  const previewEl = document.getElementById('preview');
  if (!previewEl) return;
  if (text) {
    previewEl.textContent = text;
    previewEl.classList.add('visible');
  } else {
    previewEl.textContent = '';
    previewEl.classList.remove('visible');
  }
}

function setStatus(msg: string, isError = false) {
  statusText = msg;
  statusIsError = isError;
}

function buildCombinedPrompt(): string {
  const replies = currentPayload.replies ?? [];
  const chosen = [...selectedIndices]
    .sort((a, b) => a - b)
    .map((idx) => replies[idx])
    .filter((item): item is PillOption => Boolean(item && getKind(item) === 'reply'));

  if (chosen.length === 0) return '';
  if (chosen.length === 1) return getPrompt(chosen[0]);
  return [
    'Please handle these together:',
    ...chosen.map((item, i) => `${i + 1}. ${getPrompt(item)}`),
  ].join('\n');
}

async function sendMessage(
  text: string,
  key: string,
  options: { background?: boolean; clearBatch?: boolean } = {},
) {
  const trimmed = text.trim();
  if (!trimmed || !canSend || sendingKey !== null) return;

  sendingKey = key;
  setStatus('');
  render();

  try {
    const params: Record<string, unknown> = {
      role: 'user',
      content: [{ type: 'text', text: trimmed }],
    };
    if (options.background) {
      params._meta = {
        'com.google.antigravity/message': { target: 'new' },
      };
    }

    const res = await app.sendMessage(
      params as Parameters<App['sendMessage']>[0],
    );

    if (res?.isError) {
      setStatus(
        options.background
          ? 'Could not start a background conversation from this view.'
          : 'Could not send message in this view.',
        true,
      );
    } else if (options.background) {
      forkedKeys.add(key);
      editingTarget = null;
      draftText = '';
      if (options.clearBatch) {
        selectedIndices.clear();
        multiSelectMode = false;
      }
      setStatus('Started in a new background conversation.');
    } else {
      sentKeys.add(key);
      editingTarget = null;
      draftText = '';
      if (options.clearBatch) {
        selectedIndices.clear();
        multiSelectMode = false;
      }
    }
  } catch (err) {
    setStatus(err instanceof Error ? err.message : 'Failed to send reply.', true);
  } finally {
    sendingKey = null;
  }
  render();
}

async function attachToNextMessage(text: string, key: string) {
  const trimmed = text.trim();
  if (!trimmed || !canUpdateContext) return;
  setStatus('');
  try {
    await app.updateModelContext({
      content: [{ type: 'text', text: trimmed }],
    });
    attachedKey = key;
    editingTarget = null;
    draftText = '';
    setStatus('Attached to your next message in the input box — add your edits there and send.');
  } catch (err) {
    setStatus(err instanceof Error ? err.message : 'Failed to attach context.', true);
  }
  render();
}

async function openFileInPane(uri: string, key: string) {
  if (!uri || sendingKey !== null) return;
  sendingKey = key;
  setStatus('');
  render();
  try {
    const res = await app.request(
      {
        method: 'com.google.antigravity/toggle-aux-pane',
        params: { tabType: 'fileView', uri },
      },
      ToggleAuxPaneResultSchema,
    );
    if (res?.isError) {
      setStatus(`Could not open file in side pane: ${formatFileLabel(uri)}`, true);
    } else {
      openedKeys.add(key);
    }
  } catch (err) {
    setStatus(
      err instanceof Error ? err.message : 'Side-pane file view is unavailable in this host.',
      true,
    );
  } finally {
    sendingKey = null;
  }
  render();
}

async function openExternalUrl(url: string, key: string) {
  if (!url || sendingKey !== null) return;
  if (!canOpenLinks) {
    setStatus(`Link opening is unavailable here: ${url}`, true);
    render();
    return;
  }
  sendingKey = key;
  setStatus('');
  render();
  try {
    const res = await app.openLink({ url });
    if (res?.isError) {
      setStatus(`Host blocked opening link: ${url}`, true);
    } else {
      openedKeys.add(key);
    }
  } catch (err) {
    setStatus(err instanceof Error ? err.message : 'Failed to open link.', true);
  } finally {
    sendingKey = null;
  }
  render();
}

function autoSizeTextarea(el: HTMLTextAreaElement) {
  el.style.height = 'auto';
  el.style.height = `${Math.min(160, Math.max(40, el.scrollHeight))}px`;
}

function openEditor(target: { mode: 'single'; index: number } | { mode: 'batch' }, initialText: string) {
  editingTarget = target;
  draftText = initialText;
  hoveredPreview = '';
  setStatus('');
  render();

  const textarea = document.getElementById('draft-input') as HTMLTextAreaElement | null;
  if (textarea) {
    autoSizeTextarea(textarea);
    textarea.focus();
    textarea.setSelectionRange(textarea.value.length, textarea.value.length);
  }
}

function toggleSelectIndex(idx: number) {
  multiSelectMode = true;
  if (selectedIndices.has(idx)) {
    selectedIndices.delete(idx);
  } else {
    selectedIndices.add(idx);
  }
  render();
}

function render() {
  root.innerHTML = '';

  const replies = currentPayload.replies ?? [];
  if (replies.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'status-note';
    empty.textContent = 'Preparing quick replies…';
    root.appendChild(empty);
    return;
  }

  const replyCount = replies.filter((item) => getKind(item) === 'reply').length;

  const wrap = document.createElement('div');
  wrap.className = 'wrap';

  // Header row
  const headerRow = document.createElement('div');
  headerRow.className = 'header-row';

  if (currentPayload.heading) {
    const heading = document.createElement('div');
    heading.className = 'heading';
    heading.textContent = currentPayload.heading;
    headerRow.appendChild(heading);
  }

  const controls = document.createElement('div');
  controls.className = 'header-controls';

  if (replyCount >= 2 && canSend) {
    const multiBtn = document.createElement('button');
    multiBtn.type = 'button';
    multiBtn.className = `mode-toggle${multiSelectMode ? ' is-active' : ''}`;
    multiBtn.textContent = multiSelectMode ? 'Done selecting' : 'Multi-select';
    multiBtn.title = 'Toggle multi-select mode to combine several replies into one message (or Shift+Click any pill)';
    multiBtn.addEventListener('click', () => {
      multiSelectMode = !multiSelectMode;
      if (!multiSelectMode) {
        selectedIndices.clear();
        if (editingTarget?.mode === 'batch') {
          editingTarget = null;
          draftText = '';
        }
      }
      render();
    });
    controls.appendChild(multiBtn);
  }

  const hint = document.createElement('span');
  hint.className = 'hint';
  hint.textContent = multiSelectMode
    ? 'Pick pills to combine'
    : '⌘-click edit · ⇧-click multi · ⑂ bg chat';
  controls.appendChild(hint);

  headerRow.appendChild(controls);
  wrap.appendChild(headerRow);

  // Pill row
  const row = document.createElement('div');
  row.className = 'pill-row';

  replies.forEach((item, idx) => {
    const kind = getKind(item);
    const key = `pill-${idx}`;

    // File action pill
    if (kind === 'file' && item.fileUri) {
      const btn = document.createElement('button');
      btn.type = 'button';
      const isOpened = openedKeys.has(key);
      const isBusy = sendingKey === key;
      btn.className = `pill pill-action pill-file${isOpened ? ' is-opened' : ''}${isBusy ? ' is-sending' : ''}`;
      btn.title = `Open file in side pane: ${formatFileLabel(item.fileUri)}`;
      btn.disabled = sendingKey !== null;

      const icon = document.createElement('span');
      icon.className = 'pill-icon';
      icon.textContent = isOpened ? '✓' : '📄';
      const lbl = document.createElement('span');
      lbl.className = 'pill-label';
      lbl.textContent = isBusy ? `${item.label}…` : item.label;
      btn.append(icon, lbl);

      btn.addEventListener('mouseenter', () => {
        if (!editingTarget) updatePreview(`Open file ↳ ${formatFileLabel(item.fileUri!)}`);
      });
      btn.addEventListener('mouseleave', () => updatePreview(''));
      btn.addEventListener('click', () => void openFileInPane(item.fileUri!, key));
      row.appendChild(btn);
      return;
    }

    // URL action pill
    if (kind === 'url' && item.url) {
      const btn = document.createElement('button');
      btn.type = 'button';
      const isOpened = openedKeys.has(key);
      const isBusy = sendingKey === key;
      btn.className = `pill pill-action pill-url${isOpened ? ' is-opened' : ''}${isBusy ? ' is-sending' : ''}`;
      btn.title = `Open external link: ${item.url}`;
      btn.disabled = sendingKey !== null;

      const icon = document.createElement('span');
      icon.className = 'pill-icon';
      icon.textContent = isOpened ? '✓' : '🔗';
      const lbl = document.createElement('span');
      lbl.className = 'pill-label';
      lbl.textContent = isBusy ? `${item.label}…` : item.label;
      const ext = document.createElement('span');
      ext.className = 'pill-arrow';
      ext.textContent = '↗';
      btn.append(icon, lbl, ext);

      btn.addEventListener('mouseenter', () => {
        if (!editingTarget) updatePreview(`Open link ↳ ${item.url}`);
      });
      btn.addEventListener('mouseleave', () => updatePreview(''));
      btn.addEventListener('click', () => void openExternalUrl(item.url!, key));
      row.appendChild(btn);
      return;
    }

    // Standard reply pill (with split bg-fork button & multi-select support)
    const promptText = getPrompt(item);
    const isSent = sentKeys.has(key);
    const isForked = forkedKeys.has(key);
    const isSending = sendingKey === key;
    const isForking = sendingKey === `bg-${key}`;
    const isEditing = editingTarget?.mode === 'single' && editingTarget.index === idx;
    const isSelected = selectedIndices.has(idx);
    const isAttached = attachedKey === key;

    const toneClass =
      item.tone === 'primary'
        ? 'pill-primary'
        : item.tone === 'subtle'
          ? 'pill-subtle'
          : 'pill-default';

    const group = document.createElement('div');
    group.className = `pill-group ${toneClass}${isSent ? ' is-sent' : ''}${isForked ? ' is-forked' : ''}${isSelected ? ' is-selected' : ''}${isEditing ? ' is-editing' : ''}${isAttached ? ' is-attached' : ''}${isSending || isForking ? ' is-sending' : ''}`;

    const mainBtn = document.createElement('button');
    mainBtn.type = 'button';
    mainBtn.className = 'pill-main';
    mainBtn.title = multiSelectMode
      ? `${promptText}\n(Click to toggle selection)`
      : `${promptText}\n(Click to send · ⌘-click to edit · Shift+click to multi-select)`;
    mainBtn.disabled = !canSend || sendingKey !== null || (isSent && !multiSelectMode);

    if (multiSelectMode) {
      const check = document.createElement('span');
      check.className = `pill-check${isSelected ? ' checked' : ''}`;
      check.textContent = isSelected ? '✓' : '';
      mainBtn.appendChild(check);
    } else if (!isSent && !isSending && !isAttached) {
      const leadIcon = createReplyLeadingIcon(item.label);
      if (leadIcon) mainBtn.appendChild(leadIcon);
    }

    const labelSpan = document.createElement('span');
    labelSpan.className = 'pill-label';
    if (isSent) {
      labelSpan.textContent = `✓ ${item.label}`;
    } else if (isSending) {
      labelSpan.textContent = `${item.label}…`;
    } else if (isAttached) {
      labelSpan.textContent = `+ ${item.label}`;
    } else {
      labelSpan.textContent = item.label;
    }
    mainBtn.appendChild(labelSpan);

    if (isEditing && !multiSelectMode && !isSent && !isSending) {
      const editMark = document.createElement('span');
      editMark.className = 'pill-arrow';
      editMark.textContent = '✎';
      mainBtn.appendChild(editMark);
    }

    mainBtn.addEventListener('mouseenter', () => {
      if (!editingTarget && promptText !== item.label.trim()) {
        updatePreview(`↳ ${promptText}`);
      }
    });
    mainBtn.addEventListener('mouseleave', () => updatePreview(''));
    mainBtn.addEventListener('focus', () => {
      if (!editingTarget && promptText !== item.label.trim()) {
        updatePreview(`↳ ${promptText}`);
      }
    });
    mainBtn.addEventListener('blur', () => updatePreview(''));

    mainBtn.addEventListener('click', (e: MouseEvent) => {
      if (e.shiftKey || multiSelectMode) {
        e.preventDefault();
        toggleSelectIndex(idx);
      } else if (e.metaKey || e.ctrlKey || e.altKey) {
        e.preventDefault();
        openEditor({ mode: 'single', index: idx }, promptText);
      } else {
        void sendMessage(promptText, key, { background: false });
      }
    });

    group.appendChild(mainBtn);

    // Background-chat fork button (hidden in multi-select mode; batch bar has bg-send there)
    if (!multiSelectMode && canSend && !isSent) {
      const bgBtn = document.createElement('button');
      bgBtn.type = 'button';
      bgBtn.className = `pill-bg-btn${item.background ? ' is-recommended' : ''}`;
      bgBtn.title = isForked
        ? 'Started in a new background conversation (click to fork again)'
        : 'Fork into a new background conversation in this project';
      bgBtn.disabled = sendingKey !== null;
      bgBtn.textContent = isForking ? '…' : isForked ? '✓⑂' : '⑂';

      bgBtn.addEventListener('mouseenter', () => {
        if (!editingTarget) {
          updatePreview(`Background chat ↳ ${promptText}`);
        }
      });
      bgBtn.addEventListener('mouseleave', () => updatePreview(''));
      bgBtn.addEventListener('click', (e: MouseEvent) => {
        e.stopPropagation();
        void sendMessage(promptText, `bg-${key}`, { background: true });
      });

      group.appendChild(bgBtn);
    }

    row.appendChild(group);
  });

  wrap.appendChild(row);

  // Multi-select batch action bar
  if (multiSelectMode && selectedIndices.size > 0 && editingTarget?.mode !== 'batch') {
    const count = selectedIndices.size;
    const batchBar = document.createElement('div');
    batchBar.className = 'batch-bar';

    const summary = document.createElement('span');
    summary.className = 'batch-count';
    summary.textContent = `${count} selected`;

    const batchBtns = document.createElement('div');
    batchBtns.className = 'editor-buttons';

    const clearBtn = document.createElement('button');
    clearBtn.type = 'button';
    clearBtn.className = 'action-btn';
    clearBtn.textContent = 'Clear';
    clearBtn.addEventListener('click', () => {
      selectedIndices.clear();
      multiSelectMode = false;
      render();
    });

    const editBatchBtn = document.createElement('button');
    editBatchBtn.type = 'button';
    editBatchBtn.className = 'action-btn';
    editBatchBtn.textContent = 'Edit combined';
    editBatchBtn.addEventListener('click', () => {
      openEditor({ mode: 'batch' }, buildCombinedPrompt());
    });

    const bgBatchBtn = document.createElement('button');
    bgBatchBtn.type = 'button';
    bgBatchBtn.className = 'action-btn';
    bgBatchBtn.title = 'Run all selected replies together in a new background conversation';
    bgBatchBtn.textContent = sendingKey === 'batch-bg' ? 'Starting…' : 'Run in bg ⑂';
    bgBatchBtn.disabled = sendingKey !== null;
    bgBatchBtn.addEventListener('click', () => {
      void sendMessage(buildCombinedPrompt(), 'batch-bg', {
        background: true,
        clearBatch: true,
      });
    });

    const sendBatchBtn = document.createElement('button');
    sendBatchBtn.type = 'button';
    sendBatchBtn.className = 'action-btn action-send';
    sendBatchBtn.textContent =
      sendingKey === 'batch'
        ? 'Sending…'
        : `Send ${count} together ↗`;
    sendBatchBtn.disabled = sendingKey !== null;
    sendBatchBtn.addEventListener('click', () => {
      void sendMessage(buildCombinedPrompt(), 'batch', {
        background: false,
        clearBatch: true,
      });
    });

    batchBtns.append(clearBtn, editBatchBtn, bgBatchBtn, sendBatchBtn);
    batchBar.append(summary, batchBtns);
    wrap.appendChild(batchBar);
  }

  // Inline editor (single pill via ⌘-click OR combined batch edit)
  if (editingTarget !== null) {
    const activeTarget = editingTarget;
    const key =
      activeTarget.mode === 'single' ? `pill-${activeTarget.index}` : 'batch';
    const clearBatch = activeTarget.mode === 'batch';

    const editor = document.createElement('div');
    editor.className = 'editor';

    const textarea = document.createElement('textarea');
    textarea.id = 'draft-input';
    textarea.className = 'draft-input';
    textarea.rows = activeTarget.mode === 'batch' ? 3 : 1;
    textarea.value = draftText;
    textarea.placeholder = 'Edit your reply…';
    textarea.addEventListener('input', () => {
      draftText = textarea.value;
      autoSizeTextarea(textarea);
    });
    textarea.addEventListener('keydown', (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        editingTarget = null;
        draftText = '';
        render();
      } else if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        void sendMessage(textarea.value, key, { background: false, clearBatch });
      }
    });

    const actions = document.createElement('div');
    actions.className = 'editor-actions';

    const keysHint = document.createElement('span');
    keysHint.className = 'editor-hint';
    keysHint.textContent = 'Enter send · Shift+Enter newline · Esc cancel';

    const btnGroup = document.createElement('div');
    btnGroup.className = 'editor-buttons';

    if (canUpdateContext) {
      const attachBtn = document.createElement('button');
      attachBtn.type = 'button';
      attachBtn.className = 'action-btn';
      attachBtn.title = 'Attach this draft as a context pill to your next message in the main input box';
      attachBtn.textContent = 'Attach to input';
      attachBtn.addEventListener('click', () => void attachToNextMessage(textarea.value, key));
      btnGroup.appendChild(attachBtn);
    }

    const bgSendBtn = document.createElement('button');
    bgSendBtn.type = 'button';
    bgSendBtn.className = 'action-btn';
    bgSendBtn.title = 'Send this edited message to a new background conversation';
    bgSendBtn.textContent = sendingKey === `bg-${key}` ? 'Starting…' : 'Run in bg ⑂';
    bgSendBtn.disabled = sendingKey !== null;
    bgSendBtn.addEventListener('click', () => {
      void sendMessage(textarea.value, `bg-${key}`, { background: true, clearBatch });
    });

    const cancelBtn = document.createElement('button');
    cancelBtn.type = 'button';
    cancelBtn.className = 'action-btn';
    cancelBtn.textContent = 'Cancel';
    cancelBtn.addEventListener('click', () => {
      editingTarget = null;
      draftText = '';
      render();
    });

    const sendBtn = document.createElement('button');
    sendBtn.type = 'button';
    sendBtn.className = 'action-btn action-send';
    sendBtn.textContent = sendingKey === key ? 'Sending…' : 'Send ↗';
    sendBtn.disabled = sendingKey !== null;
    sendBtn.addEventListener('click', () => {
      void sendMessage(textarea.value, key, { background: false, clearBatch });
    });

    btnGroup.append(bgSendBtn, cancelBtn, sendBtn);
    actions.append(keysHint, btnGroup);
    editor.append(textarea, actions);
    wrap.appendChild(editor);
  } else {
    const preview = document.createElement('div');
    preview.id = 'preview';
    preview.className = hoveredPreview ? 'preview visible' : 'preview';
    preview.textContent = hoveredPreview;
    wrap.appendChild(preview);
  }

  if (!canSend) {
    const note = document.createElement('div');
    note.className = 'status-note';
    note.textContent = 'Direct messaging is unavailable in this view.';
    wrap.appendChild(note);
  } else if (statusText) {
    const note = document.createElement('div');
    note.className = `status-note${statusIsError ? ' error' : ''}`;
    note.textContent = statusText;
    wrap.appendChild(note);
  }

  root.appendChild(wrap);
}

app.ontoolinput = ({ arguments: args }) => {
  const input = (args ?? {}) as InlinePayload;
  if (Array.isArray(input.replies) && input.replies.length > 0) {
    currentPayload = {
      heading: typeof input.heading === 'string' ? input.heading : '',
      replies: input.replies,
    };
    render();
  }
};

app.ontoolresult = (result) => {
  const sc = (result?.structuredContent ?? null) as InlinePayload | null;
  if (sc && Array.isArray(sc.replies)) {
    currentPayload = sc;
    render();
  }
};

app.onhostcontextchanged = (ctx) => applyTheme(ctx);

await app.connect();
applyTheme(app.getHostContext());
const caps = app.getHostCapabilities();
canSend = Boolean(caps?.message);
canUpdateContext = Boolean(caps?.updateModelContext);
canOpenLinks = caps?.openLinks !== undefined ? Boolean(caps.openLinks) : true;
render();
