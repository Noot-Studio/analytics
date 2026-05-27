/**
 * CLI client for the live variant mode poll/reply protocol.
 *
 * Usage:
 *   npx impeccable poll                         # Block until browser event, print JSON
 *   npx impeccable poll --timeout=600000        # Custom timeout (ms); default is long-poll friendly
 *   npx impeccable poll --reply <id> done       # Reply "done" to event <id>
 *   npx impeccable poll --reply <id> error "msg" # Reply with error
 */

import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { readLiveServerInfo } from "./impeccable-paths.mjs";
import {
  completionAckForAcceptResult,
  completionTypeForAcceptResult,
} from "./live-completion.mjs";

// Node's built-in fetch (undici under the hood) enforces a 300s headers
// timeout that can't be lowered per-request. We cap each request below
// that ceiling and loop in `pollOnce` to synthesize a long poll without
// depending on the standalone undici package.
const PER_REQUEST_TIMEOUT_MS = 270_000;

function readServerInfo() {
  const record = readLiveServerInfo(process.cwd());
  if (!record) {
    console.error(
      "No running live server found. Start one with: npx impeccable live"
    );
    process.exit(1);
  }
  return record.info;
}

export function buildPollReplyPayload(
  token,
  { id, type, message, file, data }
) {
  return { data, file, id, message, token, type };
}

async function postReply(base, token, reply) {
  const res = await fetch(`${base}/poll`, {
    body: JSON.stringify(buildPollReplyPayload(token, reply)),
    headers: { "Content-Type": "application/json" },
    method: "POST",
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || res.statusText);
  }
}

export async function pollCli() {
  const args = process.argv.slice(2);

  if (args.includes("--help") || args.includes("-h")) {
    console.log(`Usage: impeccable poll [options]

Wait for a browser event from the live variant server, or reply to one.

Modes:
  poll                             Block until a browser event arrives, print JSON
  poll --reply <id> done           Reply "done" to event <id>
  poll --reply <id> error "msg"    Reply with an error message

Options:
  --timeout=MS   Long-poll timeout in ms (default: 600000). Use the default unless the user asked to pause live; never use a short timeout to end the chat turn
  --help         Show this help message`);
    process.exit(0);
  }

  const info = readServerInfo();
  const base = `http://localhost:${info.port}`;

  // Reply mode: npx impeccable poll --reply <id> <status> [--file path] [message]
  const replyIdx = args.indexOf("--reply");
  if (replyIdx !== -1) {
    const id = args[replyIdx + 1];
    const status = args[replyIdx + 2] || "done";
    const fileIdx = args.indexOf("--file");
    const filePath =
      fileIdx !== -1 && fileIdx + 1 < args.length
        ? args[fileIdx + 1]
        : undefined;
    // Message is any remaining positional arg that isn't a flag
    const message =
      args.find(
        (a, i) => i > replyIdx + 2 && !a.startsWith("--") && i !== fileIdx + 1
      ) || undefined;

    if (!id) {
      console.error(
        "Usage: npx impeccable poll --reply <id> <status> [--file path] [message]"
      );
      process.exit(1);
    }

    try {
      await postReply(base, info.token, {
        file: filePath,
        id,
        message,
        type: status,
      });

      // Success — silent exit (agent doesn't need output for replies)
    } catch (error) {
      if (error.cause?.code === "ECONNREFUSED") {
        console.error(
          "Live server not running. Start one with: npx impeccable live"
        );
      } else {
        console.error("Reply failed:", error.message);
      }
      process.exit(1);
    }
    return;
  }

  // Poll mode: block until browser event. Default 10 min. Node's built-in
  // fetch enforces a 300s headers timeout, so we loop in slices under that
  // ceiling and keep re-polling until we get a real event or the user's
  // total timeout runs out.
  const timeoutArg = args.find((a) => a.startsWith("--timeout="));
  const totalTimeout = timeoutArg
    ? Number.parseInt(timeoutArg.split("=")[1], 10)
    : 600_000;

  const deadline = Date.now() + totalTimeout;
  let event;
  try {
    while (true) {
      const remaining = deadline - Date.now();
      if (remaining <= 0) {
        event = { type: "timeout" };
        break;
      }
      const slice = Math.min(remaining, PER_REQUEST_TIMEOUT_MS);
      const res = await fetch(
        `${base}/poll?token=${info.token}&timeout=${slice}`
      );

      if (res.status === 401) {
        console.error(
          "Authentication failed. The server token may have changed."
        );
        console.error(
          "Try restarting: npx impeccable live stop && npx impeccable live"
        );
        process.exit(1);
      }

      if (!res.ok) {
        console.error(`Poll failed: ${res.status} ${res.statusText}`);
        process.exit(1);
      }

      const next = await res.json();
      // Server-side timeout means no browser event arrived in this slice.
      // Loop and re-poll until we get a real event or we hit the user's
      // total deadline.
      if (next?.type === "timeout" && Date.now() < deadline) {
        continue;
      }
      event = next;
      break;
    }

    // Auto-handle accept/discard via deterministic script
    if (event.type === "accept" || event.type === "discard") {
      const __dirname = import.meta.dirname;
      const acceptScript = path.join(__dirname, "live-accept.mjs");
      const scriptArgs =
        event.type === "discard"
          ? ["--id", event.id, "--discard"]
          : ["--id", event.id, "--variant", event.variantId];
      if (
        event.type === "accept" &&
        event.paramValues &&
        Object.keys(event.paramValues).length > 0
      ) {
        scriptArgs.push("--param-values", JSON.stringify(event.paramValues));
      }
      try {
        const out = execFileSync("node", [acceptScript, ...scriptArgs], {
          cwd: process.cwd(),
          encoding: "utf-8",
          timeout: 30_000,
        });
        event._acceptResult = JSON.parse(out.trim());
      } catch (error) {
        event._acceptResult = {
          error: error.message,
          handled: false,
          mode: "error",
        };
      }

      const completionType = completionTypeForAcceptResult(
        event.type,
        event._acceptResult
      );
      try {
        await postReply(base, info.token, {
          data:
            event._acceptResult?.carbonize === true
              ? { carbonize: true }
              : undefined,
          file: event._acceptResult?.file,
          id: event.id,
          message: event._acceptResult?.error,
          type: completionType,
        });
      } catch (error) {
        event._completionAck = { error: error.message, ok: false };
      }
      if (!event._completionAck) {
        event._completionAck = completionAckForAcceptResult(
          event.id,
          completionType,
          event._acceptResult
        );
      }
    }

    // Second signal path: stderr banner in case the agent parses stdout
    // JSON but skips nested fields. One line is enough — the full checklist
    // is in reference/live.md.
    if (event._acceptResult?.carbonize === true) {
      process.stderr.write(
        `\n⚠ Carbonize cleanup REQUIRED before next poll. After cleanup, run live-complete.mjs --id ${
          event.id
        }. See reference/live.md "Required after accept".\n\n`
      );
    }

    // Print the event as JSON — the agent reads this from stdout
    console.log(JSON.stringify(event));
  } catch (error) {
    if (error.cause?.code === "ECONNREFUSED") {
      console.error(
        "Live server not running. Start one with: npx impeccable live"
      );
    } else {
      console.error("Poll failed:", error.message);
    }
    process.exit(1);
  }
}

// Auto-execute when run directly
const _running = process.argv[1];
if (
  _running?.endsWith("live-poll.mjs") ||
  _running?.endsWith("live-poll.mjs/")
) {
  pollCli();
}
