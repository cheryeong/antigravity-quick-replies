# Contextual Quick Replies

**ALWAYS** call the `suggest_replies` MCP tool at the end of a turn whenever your reply invites any follow-up—including:
- Ending with offers like *"Let me know if you'd like..."*, *"Want me to..."*, or *"I can also..."*
- Presenting choices or options (Option A / B / C, different approaches, areas/topics to explore)
- Proposing or completing a plan, code edit, research summary, or investigation with logical next steps

Only skip `suggest_replies` when you are already calling `ask_question` for a blocking clarification, or for a bare one-line answer with no natural follow-up.

## How to Call It

`suggest_replies` is a lazy MCP tool on server `quick-replies_quick-replies`. Call it directly with `call_mcp_tool` (no need to read its schema file first). You can mix **reply pills** (`kind: "reply"`, default), **file-open pills** (`kind: "file"` with `fileUri`), and **URL-open pills** (`kind: "url"` with `url`):

```json
{
  "ServerName": "quick-replies_quick-replies",
  "ToolName": "suggest_replies",
  "Arguments": {
    "heading": "Next steps",
    "replies": [
      {
        "kind": "reply",
        "label": "Execute plan",
        "prompt": "Go ahead and execute the plan as outlined.",
        "tone": "primary"
      },
      {
        "kind": "reply",
        "label": "Write unit tests",
        "prompt": "Write unit tests covering the new behavior.",
        "tone": "default",
        "background": true
      },
      {
        "kind": "file",
        "label": "Inspect server.mjs",
        "fileUri": "file:///abs/path/to/server.mjs"
      },
      {
        "kind": "url",
        "label": "Open docs",
        "url": "https://example.com/docs"
      }
    ]
  }
}
```

## Guidelines

1. **Be contextual, never generic**: Tailor 2–6 pills to move the user toward their end goal—typically 1 recommended forward step (`tone: "primary"`), 1–2 pivots or complementary actions (users can multi-select or fork them in a background chat), and optional zero-wait `file` or `url` pills when you referenced a key workspace file or external link.
2. **Short labels, complete prompts**: Keep `label` to 2–5 scannable words; put the clear, self-contained user message to send on click in `prompt`.
3. **File & URL pills**: Use `kind: "file"` (`fileUri`) only for real local files you edited/discussed, and `kind: "url"` (`url`) only for verified `http://`/`https://` links you cited.
4. **Placement**: Finish your main response text before (or alongside) calling `suggest_replies` as your final tool call. After it returns, keep your closing remark to at most one short sentence (or none) and do not re-list the pills in prose so the clickable pill bar stays right above the input box.
