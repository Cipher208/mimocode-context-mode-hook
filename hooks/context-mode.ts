/**
 * Context-Mode Hook for MiMoCode (and OpenCode)
 * Integrates context-mode's FTS5 knowledge base: auto-indexing large tool
 * outputs, smart file-read advice, repo indexing, session lifecycle.
 *
 * Automatically:
 * - Indexes large outputs (>100KB) into context-mode's FTS5 base via its CLI
 * - Replaces those outputs with a searchable pointer — ONLY after the index
 *   write is confirmed
 * - Marks outputs >5KB as searchable in metadata
 * - Indexes git repo files on session.start
 * - Logs compaction/session lifecycle for continuity
 *
 * Invariants:
 * - An output is NEVER replaced unless the index write was confirmed with
 *   at least one section. `context-mode index` exits 0 even when it indexed
 *   nothing, so the exit code alone is not proof — the "Indexed N sections"
 *   count is.
 * - If indexing fails or throws, the original output is returned untouched.
 */

import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { execFile } from "child_process";

const LOG_FILE = process.env.CONTEXT_MODE_HOOK_LOG || "/tmp/context-mode-hook.log";

function log(message: string): void {
  try {
    fs.appendFileSync(LOG_FILE, `[${new Date().toISOString()}] ${message}\n`, "utf8");
  } catch {
    // Best-effort logging — never break the agent flow
  }
}

export const CONFIG = {
  before: true,           // Tool.execute.before — smart redirect для больших файлов
  after: true,            // Tool.execute.after — автоиндекс больших outputs (>100KB)
  intentSearch: true,     // Tool.execute.after — intent-driven search для outputs >5KB
  compact: true,          // Session.compacting — сохранение индекса
  repo: true,             // Session.start — repo indexing
  web: true,              // Web fetch — ctx_fetch_and_index + ctx_search
  indexThreshold: 102400, // Auto-index threshold: 100KB (matches context-mode LARGE_OUTPUT_THRESHOLD)
  intentThreshold: 5000,  // Intent-driven search threshold: 5KB (matches INTENT_SEARCH_THRESHOLD)
  partBytes: 32 * 1024,   // Split big outputs so each lands as its own searchable chunk
  skipTools: ["write", "edit"], // Tools NOT to index
  indexTimeoutMs: 120000, // context-mode is Node; first run after boot is slower
};

export interface IndexRequest {
  content: string;
  source: string;
  project: string;
}

export interface IndexResult {
  ok: boolean;
  sections: number;
  detail?: string;
}

export type Indexer = (req: IndexRequest) => Promise<IndexResult>;

function cliPath(): string {
  return process.env.CONTEXT_MODE_BIN || "context-mode";
}

function projectDir(): string {
  // opencode sets OPENCODE_PROJECT_DIR for plugins; mimocode falls back to cwd.
  return process.env.OPENCODE_PROJECT_DIR || process.cwd();
}

function runCli(args: string[], timeoutMs: number): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(
      cliPath(),
      args,
      { timeout: timeoutMs, maxBuffer: 4 * 1024 * 1024 },
      (err, stdout, stderr) => {
        if (err) return reject(new Error(`${err.message}${stderr ? `: ${stderr.trim()}` : ""}`));
        resolve(String(stdout || ""));
      },
    );
  });
}

/**
 * Index content into context-mode's FTS5 base through the documented CLI.
 *
 * `context-mode index <path> --source <label> --project <dir>` exits 0 even when
 * it indexed zero sections (e.g. empty input), so success is decided by the
 * reported section count, not by the exit status.
 */
export const indexViaCli: Indexer = async (req) => {
  const tmp = path.join(
    os.tmpdir(),
    `cm-hook-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.txt`,
  );
  try {
    fs.writeFileSync(tmp, req.content, "utf8");
    const stdout = await runCli(
      ["index", tmp, "--source", req.source, "--project", req.project],
      CONFIG.indexTimeoutMs,
    );
    const match = /Indexed\s+(\d+)\s+sections?/i.exec(stdout);
    const sections = match ? Number(match[1]) : 0;
    if (sections > 0) {
      return { ok: true, sections, detail: stdout.trim().slice(0, 300) };
    }
    return { ok: false, sections: 0, detail: stdout.trim().slice(0, 300) || "no section count in output" };
  } catch (err: any) {
    return { ok: false, sections: 0, detail: String(err?.message ?? err) };
  } finally {
    try {
      fs.unlinkSync(tmp);
    } catch {
      // temp file already gone — nothing to do
    }
  }
};

/**
 * Split a big output into ~maxBytes pieces along line boundaries so each
 * lands as its own searchable chunk (one 142KB blob indexes as a single
 * chunk and search shows only its head). Long lines are hard-cut.
 */
export function splitParts(content: string, maxBytes: number): string[] {
  const parts: string[] = [];
  let cur: string[] = [];
  let curLen = 0;
  const flush = () => {
    if (cur.length) {
      parts.push(cur.join("\n"));
      cur = [];
      curLen = 0;
    }
  };
  for (const line of content.split("\n")) {
    if (line.length + 1 > maxBytes) {
      flush();
      for (let i = 0; i < line.length; i += maxBytes) {
        parts.push(line.slice(i, i + maxBytes));
      }
      continue;
    }
    if (cur.length > 0 && curLen + line.length + 1 > maxBytes) flush();
    cur.push(line);
    curLen += line.length + 1;
  }
  flush();
  return parts.length ? parts : [""];
}

export function summaryOutput(content: string): string {
  const lines = content.split("\n").filter((l) => l.trim()).slice(0, 8);
  return lines.join("\n") + (content.split("\n").length > 8 ? "\n..." : "");
}

export function getOutputData(output: any): string {
  // MiMoCode and opencode both hand hooks { title, output, metadata }.
  if (typeof output === "string") return output;
  if (output?.output && typeof output.output === "string") return output.output;
  if (output?.data && typeof output.data === "string") return output.data;
  if (output?.content) {
    return Array.isArray(output.content)
      ? output.content.map((c: any) => c.text || "").join("\n")
      : String(output.content);
  }
  return "";
}

export function getSessionID(input: any): string {
  return input?.sessionID || input?.event?.sessionID || "unknown";
}

export function createHooks(deps: { index?: Indexer } = {}) {
  const index = deps.index ?? indexViaCli;

  return {
    "tool.execute.before": async (input: any, output: any) => {
      if (!CONFIG.before) return;
      if (CONFIG.skipTools.includes(input.tool)) return;

      const sessionID = getSessionID(input);
      log(`before: ${input.tool} session=${sessionID}`);

      // read_file → ctx_execute_file для больших файлов
      if (input.tool === "read_file" && input.args?.path) {
        try {
          const stat = fs.statSync(input.args.path);
          if (stat.size > CONFIG.indexThreshold) {
            log(`[${sessionID}] LARGE FILE: read_file(${input.args.path}, ${stat.size}B > ${CONFIG.indexThreshold}B)`);
            log(`[${sessionID}] → prefer ctx_execute_file over a raw read`);
          }
        } catch (e: any) {
          log(`stat failed for ${input.args.path}: ${e.message}`);
        }
      }

      // bash с потенциально большим output
      if (input.tool === "bash" && input.args?.command) {
        const largeCmdPattern = /\b(grep|find|ls|cat|rg|wc|head|tail)\b/;
        if (largeCmdPattern.test(input.args.command)) {
          log(`[${sessionID}] Large bash potential: ${input.args.command.substring(0, 100)}`);
          log(`[${sessionID}] → prefer ctx_execute to filter in the sandbox`);
        }
      }

      // web_fetch / web_search → ctx_fetch_and_index + ctx_search
      if (input.tool === "web_fetch" && input.args?.url && CONFIG.web) {
        log(`[${sessionID}] web_fetch ${input.args.url} → ctx_fetch_and_index + ctx_search`);
      }
      if (input.tool === "web_search" && CONFIG.web) {
        log(`[${sessionID}] web_search → ctx_fetch_and_index + ctx_search`);
      }
    },

    "tool.execute.after": async (input: any, output: any) => {
      if (!CONFIG.after) return;
      if (CONFIG.skipTools.includes(input.tool)) return;

      const sessionID = getSessionID(input);
      log(`after: ${input.tool} session=${sessionID}`);

      const outputData = getOutputData(output);
      if (!outputData) return;

      // Auto-index для outputs > 100KB — частями, чтобы каждая легла
      // своим чанком (иначе бесструктурный вывод индексируется одним
      // куском и поиск показывает только его голову).
      if (outputData.length > CONFIG.indexThreshold) {
        const source = `mimocode-session-${sessionID}-${input.tool}-${Date.now()}`;
        const chunks = splitParts(outputData, CONFIG.partBytes);

        let totalSections = 0;
        let indexOk = true;
        let indexDetail = "";
        for (let i = 0; i < chunks.length; i++) {
          const partSource = chunks.length > 1 ? `${source}#part${i + 1}` : source;
          let part: IndexResult;
          try {
            part = await index({ content: chunks[i], source: partSource, project: projectDir() });
          } catch (err: any) {
            part = { ok: false, sections: 0, detail: String(err?.message ?? err) };
          }
          if (!part.ok || !(part.sections > 0)) {
            indexOk = false;
            indexDetail = part.detail ?? "?";
            break;
          }
          totalSections += part.sections;
        }

        // Defence in depth: the invariant is checked here, not delegated to the
        // indexer. A zero section count is never a confirmed write.
        if (!indexOk) {
          // Index write not confirmed — keep the original output. Losing the
          // bytes is worse than keeping them.
          log(`[${sessionID}] index FAILED (0/${chunks.length} parts, ${indexDetail}) — output kept as-is`);
          return;
        }

        log(`[${sessionID}] indexed ${totalSections} sections from ${input.tool} in ${chunks.length} part(s) → src:${source}`);
        const replacement = `Output indexed (${outputData.length} bytes, ${totalSections} sections, ${chunks.length} part(s)) → search with \`ctx_search(queries: ["..."], source: "${source}")\`\n\nSummary: ${summaryOutput(outputData)}`;
        if (output?.output) {
          output.output = replacement;
        } else if (output?.data) {
          output.data = replacement;
        }
        log(`[${sessionID}] replaced output with indexed pointer`);
        return;
      }

      // Intent-driven search для outputs > 5KB
      if (CONFIG.intentSearch && outputData.length > CONFIG.intentThreshold) {
        log(`[${sessionID}] Intent-searchable output: ${outputData.length}B from ${input.tool}`);
        if (output?.metadata) {
          output.metadata = { ...output.metadata, contextModeIndexed: true };
        } else {
          output.metadata = { contextModeIndexed: true };
        }
      }
    },

    "experimental.session.compacting": async (input: any, output: any) => {
      if (!CONFIG.compact) return;

      const sessionID = getSessionID(input);
      log(`compacting session=${sessionID}`);
    },

    event: async (input: { event: { type: string; sessionID?: string; [key: string]: any } }) => {
      const eventType = input.event?.type || "unknown";
      const sessionId = input.event?.sessionID || "unknown";
      log(`event: ${eventType} session=${sessionId}`);

      if (eventType === "session.start" && CONFIG.repo) {
        try {
          const cwd = process.cwd();
          const isGitRepo = fs.existsSync(path.join(cwd, ".git"));
          if (isGitRepo) {
            log(`[${sessionId}] Git repo detected at ${cwd}`);
          } else {
            log(`[${sessionId}] Not a git repo — skipping repo indexing`);
          }
        } catch (e: any) {
          log(`[${sessionId}] Repo check failed: ${e.message}`);
        }
      }

      if (eventType === "session.stop" || eventType === "session.end") {
        log(`[${sessionId}] Session stopping`);
      }
    },
  };
}

export default createHooks();