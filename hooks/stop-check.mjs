import fs from 'node:fs';

function readStdin() {
  try {
    return fs.readFileSync(0, 'utf8');
  } catch {
    return '';
  }
}

function unquote(val) {
  if (typeof val !== 'string') return '';
  const trimmed = val.trim();
  if (trimmed.length >= 2 && trimmed.startsWith('"') && trimmed.endsWith('"')) {
    try {
      const parsed = JSON.parse(trimmed);
      if (typeof parsed === 'string') return parsed;
    } catch {
      // fall through
    }
  }
  return trimmed;
}

function allowStop() {
  process.stdout.write('{}\n');
  process.exit(0);
}

function continueWithNudge() {
  const response = {
    decision: 'continue',
    reason:
      'Before ending this turn, call `call_mcp_tool` with `ServerName: "quick-replies_quick-replies"` and `ToolName: "suggest_replies"` to render 2–6 contextual quick-reply pills for the follow-ups, options, or next steps in your reply. Do not repeat your main answer—just emit the pills and finish with at most one short closing sentence (or none).',
  };
  process.stdout.write(`${JSON.stringify(response)}\n`);
  process.exit(0);
}

function main() {
  const raw = readStdin().trim();
  if (!raw) allowStop();

  let payload;
  try {
    payload = JSON.parse(raw);
  } catch {
    allowStop();
  }

  // Only enforce on normal turn completion, never on errors/cancellations/limits,
  // never while waiting on background work, and never more than once per turn.
  if (payload.continuationActive === true) allowStop();
  if (payload.terminationReason && payload.terminationReason !== 'NO_TOOL_CALL') allowStop();
  if (payload.error) allowStop();
  if (payload.fullyIdle === false) allowStop();

  const transcriptPath = typeof payload.transcriptPath === 'string' ? payload.transcriptPath : '';
  if (!transcriptPath || !fs.existsSync(transcriptPath)) allowStop();

  let lines;
  try {
    const content = fs.readFileSync(transcriptPath, 'utf8');
    lines = content
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean)
      .map((l) => {
        try {
          return JSON.parse(l);
        } catch {
          return null;
        }
      })
      .filter(Boolean);
  } catch {
    allowStop();
  }

  if (!lines.length) allowStop();

  // Subagent conversations start with SYSTEM_MESSAGE rather than USER_INPUT.
  if (lines[0]?.type !== 'USER_INPUT') allowStop();

  let lastUserIdx = -1;
  for (let i = lines.length - 1; i >= 0; i--) {
    if (lines[i]?.type === 'USER_INPUT') {
      lastUserIdx = i;
      break;
    }
  }
  if (lastUserIdx === -1) allowStop();

  const turnSteps = lines.slice(lastUserIdx + 1);
  let calledSuggestReplies = false;
  let calledSkipTool = false;
  const assistantChunks = [];

  for (const step of turnSteps) {
    if (step?.type !== 'PLANNER_RESPONSE') continue;

    if (typeof step.content === 'string' && step.content.trim()) {
      assistantChunks.push(step.content.trim());
    }

    const toolCalls = Array.isArray(step.tool_calls) ? step.tool_calls : [];
    for (const tc of toolCalls) {
      const name = unquote(tc?.name);
      if (name === 'suggest_replies') {
        calledSuggestReplies = true;
      } else if (name === 'call_mcp_tool') {
        const toolName = unquote(tc?.args?.ToolName);
        if (toolName === 'suggest_replies') {
          calledSuggestReplies = true;
        }
      } else if (name === 'ask_question' || name === 'finish') {
        calledSkipTool = true;
      }
    }
  }

  if (calledSuggestReplies || calledSkipTool) allowStop();

  const fullText = assistantChunks.join('\n\n').trim();
  if (!fullText) allowStop();

  // Skip bare one-line answers that don't ask a question or offer follow-ups.
  const isBareOneLiner =
    fullText.length < 140 &&
    !fullText.includes('\n') &&
    !fullText.includes('?') &&
    !/\b(let me know|want me to|would you like|if you want|i can also|pick any|choose|next step)\b/i.test(fullText);

  if (isBareOneLiner) allowStop();

  continueWithNudge();
}

main();
