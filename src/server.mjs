import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListResourcesRequestSchema,
  ListToolsRequestSchema,
  ReadResourceRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PLUGIN_ROOT = path.resolve(__dirname, '..');

const INLINE_URI = 'ui://quick-replies/inline.html';
const MCP_APP_MIME = 'text/html;profile=mcp-app';

function sanitizeTone(tone, fallback = 'default') {
  return tone === 'primary' || tone === 'subtle' || tone === 'default' ? tone : fallback;
}

function normalizeFileUri(raw) {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith('file://')) return trimmed;
  if (path.isAbsolute(trimmed)) {
    try {
      return pathToFileURL(trimmed).href;
    } catch {
      return null;
    }
  }
  return null;
}

function normalizeHttpUrl(raw) {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
      return parsed.href;
    }
  } catch {
    return null;
  }
  return null;
}

function sanitizeReplies(rawReplies) {
  if (!Array.isArray(rawReplies)) return [];
  const out = [];

  for (const item of rawReplies.slice(0, 8)) {
    if (!item || typeof item.label !== 'string' || !item.label.trim()) continue;
    const label = item.label.trim().slice(0, 60);
    const id = `reply-${out.length + 1}`;

    const fileUri = normalizeFileUri(item.fileUri ?? item.path);
    const url = normalizeHttpUrl(item.url);
    const explicitKind = item.kind;

    if (explicitKind === 'file' || (!explicitKind && fileUri && !item.prompt)) {
      if (!fileUri) continue;
      out.push({
        id,
        kind: 'file',
        label,
        fileUri,
        tone: sanitizeTone(item.tone, 'subtle'),
      });
      continue;
    }

    if (explicitKind === 'url' || (!explicitKind && url && !item.prompt)) {
      if (!url) continue;
      out.push({
        id,
        kind: 'url',
        label,
        url,
        tone: sanitizeTone(item.tone, 'subtle'),
      });
      continue;
    }

    const prompt =
      typeof item.prompt === 'string' && item.prompt.trim()
        ? item.prompt.trim().slice(0, 1200)
        : label;

    out.push({
      id,
      kind: 'reply',
      label,
      prompt,
      tone: sanitizeTone(item.tone, 'default'),
      background: Boolean(item.background),
    });
  }

  return out;
}

function readInlineHtml() {
  return fs.readFileSync(path.join(PLUGIN_ROOT, 'dist', 'inline.html'), 'utf8');
}

const server = new Server(
  {
    name: 'quick-replies',
    version: '1.3.0',
  },
  {
    capabilities: {
      tools: {},
      resources: {},
    },
  },
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: 'suggest_replies',
      description:
        'Render contextual one-tap quick-reply and action pills inline in the conversation. Supports chat replies (with multi-select batching, ⌘-click inline editing, and background-conversation forking) plus zero-wait file-open and external URL pills.',
      inputSchema: {
        type: 'object',
        properties: {
          heading: {
            type: 'string',
            description:
              'Optional short label above the pills, e.g. "Next steps", "Choose an option", or "Plan decision".',
          },
          replies: {
            type: 'array',
            description:
              '2 to 6 concise contextual pills. Mix reply pills (send a prompt) with optional file pills (open a workspace file in the side pane) or URL pills (open an http/https link directly).',
            minItems: 1,
            maxItems: 8,
            items: {
              type: 'object',
              properties: {
                kind: {
                  type: 'string',
                  enum: ['reply', 'file', 'url'],
                  description:
                    'Pill type. Defaults to "reply" (or auto-inferred as "file"/"url" when fileUri/url is set without prompt).',
                },
                label: {
                  type: 'string',
                  description: 'Short button label (2-5 words), e.g. "Execute plan", "Open server.mjs", or "Visit List.my".',
                },
                prompt: {
                  type: 'string',
                  description: 'For reply pills: full user message sent into the conversation when tapped.',
                },
                fileUri: {
                  type: 'string',
                  description: 'For file pills: absolute file path or file:/// URI to open directly in the side pane.',
                },
                url: {
                  type: 'string',
                  description: 'For url pills: http:// or https:// URL to open directly in the browser.',
                },
                tone: {
                  type: 'string',
                  enum: ['primary', 'default', 'subtle'],
                  description: 'Use "primary" for at most one recommended reply; "default" or "subtle" for others.',
                },
                background: {
                  type: 'boolean',
                  description: 'Optional hint that a reply pill is a parallel side-task suited for background-chat forking.',
                },
              },
              required: ['label'],
            },
          },
        },
        required: ['replies'],
      },
      _meta: {
        ui: {
          resourceUri: INLINE_URI,
        },
      },
    },
  ],
}));

server.setRequestHandler(ListResourcesRequestSchema, async () => ({
  resources: [
    {
      uri: INLINE_URI,
      name: 'Quick Replies Inline Pills',
      description: 'Compact inline contextual quick-reply and action pills.',
      mimeType: MCP_APP_MIME,
      _meta: {
        ui: {
          prefersBorder: false,
        },
      },
    },
  ],
}));

server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
  const { uri } = request.params;
  if (uri === INLINE_URI) {
    return {
      contents: [
        {
          uri: INLINE_URI,
          mimeType: MCP_APP_MIME,
          text: readInlineHtml(),
          _meta: {
            ui: {
              prefersBorder: false,
            },
          },
        },
      ],
    };
  }
  throw new Error(`Unknown resource URI: ${uri}`);
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args = {} } = request.params;

  if (name === 'suggest_replies') {
    const replies = sanitizeReplies(args.replies);
    const heading = typeof args.heading === 'string' ? args.heading.trim().slice(0, 60) : '';
    const labels = replies.map((r) => r.label).join(' · ');

    return {
      content: [
        {
          type: 'text',
          text: `Displayed ${replies.length} quick-reply pills (${labels}).`,
        },
      ],
      structuredContent: {
        heading,
        replies,
      },
    };
  }

  throw new Error(`Unknown tool: ${name}`);
});

const transport = new StdioServerTransport();
await server.connect(transport);
