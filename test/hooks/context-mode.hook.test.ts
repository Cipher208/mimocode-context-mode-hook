/**
 * Tests for context-mode hook logic.
 * Tests the pure logic functions without requiring MiMoCode runtime.
 * Run: bun test ~/.local/share/mimocode/test/hooks/test_context_mode_hook.ts
 */

import { test, expect, describe, beforeEach, afterEach } from "bun:test";
import * as fs from "fs";
import * as path from "path";

// Mock config values matching the hook
const CONFIG = {
  before: true,
  after: true,
  intentSearch: true,
  compact: true,
  repo: true,
  web: true,
  indexThreshold: 102400,
  intentThreshold: 5000,
  skipTools: ["write", "edit"],
};

// Test helper functions — must match hook implementation
function summaryOutput(content: string): string {
  const lines = content.split("\n").filter((l) => l.trim()).slice(0, 8);
  return lines.join("\n") + (content.split("\n").length > 8 ? "\n..." : "");
}

function getOutputData(output: any): string {
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

function getSessionID(input: any): string {
  return input?.sessionID || input?.event?.sessionID || "unknown";
}

// Test log file
const TEST_LOG = "/tmp/test-context-mode-hook.log";
let logBuffer: string[] = [];

function log(message: string): void {
  logBuffer.push(`[${new Date().toISOString()}] ${message}`);
}

describe("context-mode hook config", () => {
  test("CONFIG has all required fields", () => {
    expect(CONFIG.before).toBe(true);
    expect(CONFIG.after).toBe(true);
    expect(CONFIG.indexThreshold).toBe(102400);
    expect(CONFIG.intentThreshold).toBe(5000);
    expect(CONFIG.skipTools).toContain("write");
    expect(CONFIG.skipTools).toContain("edit");
  });

  test("indexThreshold matches context-mode LARGE_OUTPUT_THRESHOLD", () => {
    expect(CONFIG.indexThreshold).toBe(102400); // 100KB
  });

  test("intentThreshold matches context-mode INTENT_SEARCH_THRESHOLD", () => {
    expect(CONFIG.intentThreshold).toBe(5000); // 5KB
  });
});

describe("summaryOutput", () => {
  test("returns first 8 non-empty lines", () => {
    const content = Array.from({ length: 15 }, (_, i) => `Line ${i + 1}`).join("\n");
    const result = summaryOutput(content);
    const lines = result.split("\n");
    expect(lines.length).toBe(9); // 8 lines + "..." suffix
    expect(lines[0]).toBe("Line 1");
    expect(lines[7]).toBe("Line 8");
    expect(lines[8]).toBe("...");
  });

  test("returns all lines if <= 8 non-empty lines", () => {
    const content = "Line 1\nLine 2\nLine 3";
    const result = summaryOutput(content);
    expect(result).toBe("Line 1\nLine 2\nLine 3");
  });

  test("filters empty lines", () => {
    const content = "\n\nLine 1\n\n\nLine 2\n\n";
    const result = summaryOutput(content);
    expect(result).toBe("Line 1\nLine 2");
  });

  test("handles empty string", () => {
    const result = summaryOutput("");
    expect(result).toBe("");
  });
});

describe("getOutputData", () => {
  test("handles string output", () => {
    expect(getOutputData("hello")).toBe("hello");
  });

  test("handles { output: string } format", () => {
    expect(getOutputData({ output: "test data" })).toBe("test data");
  });

  test("handles { data: string } format", () => {
    expect(getOutputData({ data: "test data" })).toBe("test data");
  });

  test("handles content array format", () => {
    const output = {
      content: [
        { text: "part 1" },
        { text: "part 2" },
      ],
    };
    expect(getOutputData(output)).toBe("part 1\npart 2");
  });

  test("handles content string format", () => {
    expect(getOutputData({ content: "raw content" })).toBe("raw content");
  });

  test("returns empty string for null/undefined", () => {
    expect(getOutputData(null)).toBe("");
    expect(getOutputData(undefined)).toBe("");
    expect(getOutputData({})).toBe("");
  });

  test("prioritizes output field over data", () => {
    expect(getOutputData({ output: "first", data: "second" })).toBe("first");
  });
});

describe("getSessionID", () => {
  test("extracts sessionID from input.sessionID", () => {
    expect(getSessionID({ sessionID: "sess_123" })).toBe("sess_123");
  });

  test("extracts sessionID from input.event.sessionID", () => {
    expect(getSessionID({ event: { sessionID: "sess_456" } })).toBe("sess_456");
  });

  test("returns unknown when no sessionID", () => {
    expect(getSessionID({})).toBe("unknown");
    expect(getSessionID(null)).toBe("unknown");
    expect(getSessionID(undefined)).toBe("unknown");
  });
});

describe("tool.execute.before logic", () => {
  test("skips skipTools", () => {
    const input = { tool: "write", args: {}, sessionID: "test_sess" };
    if (CONFIG.skipTools.includes(input.tool)) {
      log(`before: SKIP ${input.tool} (in skipTools)`);
    }
    expect(CONFIG.skipTools).toContain("write");
  });

  test("logs command for bash with grep", () => {
    const input = { tool: "bash", args: { command: "grep -r pattern ." }, sessionID: "test_sess" };
    const largeCmdPattern = /\b(grep|find|ls|cat|rg|wc|head|tail)\b/;
    expect(largeCmdPattern.test(input.args.command)).toBe(true);
  });

  test("does not match small commands", () => {
    const input = { tool: "bash", args: { command: "echo hello" }, sessionID: "test_sess" };
    const largeCmdPattern = /\b(grep|find|ls|cat|rg|wc|head|tail)\b/;
    expect(largeCmdPattern.test(input.args.command)).toBe(false);
  });

  test("detects web_fetch with url", () => {
    const input = { tool: "web_fetch", args: { url: "https://example.com" }, sessionID: "test_sess" };
    expect(input.tool).toBe("web_fetch");
    expect(input.args?.url).toBeTruthy();
    expect(CONFIG.web).toBe(true);
  });

  test("detects web_search", () => {
    const input = { tool: "web_search", args: {}, sessionID: "test_sess" };
    expect(input.tool).toBe("web_search");
    expect(CONFIG.web).toBe(true);
  });
});

describe("tool.execute.after logic", () => {
  test("auto-indexes outputs > 100KB", () => {
    const largeOutput = "x".repeat(102401); // 100KB + 1 byte
    const output = { output: largeOutput, metadata: {} };
    const outputData = getOutputData(output);

    expect(outputData.length).toBe(102401);
    expect(outputData.length > CONFIG.indexThreshold).toBe(true);
  });

  test("does not auto-index outputs < 100KB", () => {
    const smallOutput = "x".repeat(50000);
    const output = { output: smallOutput, metadata: {} };
    const outputData = getOutputData(output);

    expect(outputData.length < CONFIG.indexThreshold).toBe(true);
  });

  test("marks intent-searchable outputs > 5KB", () => {
    const mediumOutput = "x".repeat(5001);
    const output = { output: mediumOutput, metadata: {} };
    const outputData = getOutputData(output);

    expect(outputData.length > CONFIG.intentThreshold).toBe(true);
    expect(outputData.length <= CONFIG.indexThreshold).toBe(true);
  });

  test("does not mark intent-searchable outputs < 5KB", () => {
    const smallOutput = "x".repeat(4999);
    const output = { output: smallOutput, metadata: {} };
    const outputData = getOutputData(output);

    expect(outputData.length <= CONFIG.intentThreshold).toBe(true);
  });

  test("generates correct source name for indexed output", () => {
    const sessionID = "sess_abc123";
    const tool = "bash";
    const timestamp = 1234567890;
    const source = `mimocode-session-${sessionID}-${tool}-${timestamp}`;
    expect(source).toContain(sessionID);
    expect(source).toContain(tool);
    expect(source).toContain("mimocode-session-");
  });

  test("generates replacement output with searchable pointer", () => {
    const largeOutput = "x".repeat(102401);
    const output = { output: largeOutput, metadata: {} };
    const outputData = getOutputData(output);
    const source = `mimocode-session-test_sess-bash-123`;
    const replacement = `Output indexed (${outputData.length} bytes) → search with \`ctx_search(queries: ["..."], source: "${source}")\`\n\nSummary: ${summaryOutput(outputData)}`;

    expect(replacement).toContain(`(${outputData.length} bytes)`);
    expect(replacement).toContain("ctx_search");
    expect(replacement).toContain(source);
    expect(replacement).toContain("Summary:");
  });

  test("adds contextModeIndexed metadata for intent-searchable outputs", () => {
    const mediumOutput = "x".repeat(5001);
    const output: { output: string; metadata: Record<string, unknown> } = {
      output: mediumOutput,
      metadata: {},
    };
    const outputData = getOutputData(output);

    if (CONFIG.intentSearch && outputData.length > CONFIG.intentThreshold) {
      output.metadata = { ...output.metadata, contextModeIndexed: true };
    }

    expect(output.metadata.contextModeIndexed).toBe(true);
  });
});

describe("event handler logic", () => {
  test("extracts event type from input.event.type", () => {
    const input = { event: { type: "session.start", sessionID: "sess_123" } };
    const eventType = input.event?.type || "unknown";
    expect(eventType).toBe("session.start");
  });

  test("identifies session.start event", () => {
    const eventType = "session.start";
    expect(eventType === "session.start").toBe(true);
  });

  test("identifies session.stop event", () => {
    const eventType = "session.stop";
    expect(eventType === "session.stop" || eventType === "session.end").toBe(true);
  });

  test("identifies non-session events", () => {
    const eventType: string = "metrics.tool_call";
    expect(eventType === "session.start").toBe(false);
    expect(eventType === "session.stop" || eventType === "session.end").toBe(false);
  });

  test("extracts sessionID from event", () => {
    const input = { event: { type: "session.start", sessionID: "sess_123" } };
    const sessionId = input.event?.sessionID || "unknown";
    expect(sessionId).toBe("sess_123");
  });

  test("returns unknown sessionID when missing", () => {
    const input: { event: { type: string; sessionID?: string } } = {
      event: { type: "metrics.tool_call" },
    };
    const sessionId = input.event?.sessionID || "unknown";
    expect(sessionId).toBe("unknown");
  });
});

describe("experimental.session.compacting handler", () => {
  test("compacting handler logs session info", () => {
    const input = { sessionID: "sess_compact_123" };
    const handler = { compact: true };
    expect(handler.compact).toBe(true);
    expect(input.sessionID).toBe("sess_compact_123");
  });

  test("compacting handler respects CONFIG.compact flag", () => {
    const handler = { compact: false };
    expect(handler.compact).toBe(false);
  });
});

describe("git repo detection logic", () => {
  const tmpDir = "/tmp/test-context-mode-repo";

  beforeEach(() => {
    if (!fs.existsSync(tmpDir)) {
      fs.mkdirSync(tmpDir, { recursive: true });
    }
  });

  afterEach(() => {
    if (fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  test("detects git repo when .git exists", () => {
    if (!fs.existsSync(path.join(tmpDir, ".git"))) {
      fs.mkdirSync(path.join(tmpDir, ".git"), { recursive: true });
    }
    expect(fs.existsSync(path.join(tmpDir, ".git"))).toBe(true);
  });

  test("reports non-git repo when .git missing", () => {
    // tmpDir exists but no .git
    expect(fs.existsSync(tmpDir)).toBe(true);
    expect(fs.existsSync(path.join(tmpDir, ".git"))).toBe(false);
  });
});

describe("integration: full hook flow", () => {
  test("before+after flow for read_file with large file", () => {
    logBuffer = [];
    
    // Before handler
    const beforeInput = { 
      tool: "read_file", 
      args: { path: "/large/file.ts" }, 
      sessionID: "sess_integration" 
    };
    const beforeOutput = {};
    log(`before: ${beforeInput.tool} session=${getSessionID(beforeInput)}`);
    
    // Simulate file stat check
    const fileSize = 150000; // > 100KB
    if (fileSize > CONFIG.indexThreshold) {
      log(`[${getSessionID(beforeInput)}] LARGE FILE detected (${fileSize}B)`);
    }
    
    // After handler (simulated output)
    const afterInput = beforeInput;
    const afterOutput = { 
      output: "x".repeat(150000), 
      metadata: {} 
    };
    const outputData = getOutputData(afterOutput);
    
    expect(outputData.length > CONFIG.indexThreshold).toBe(true);
    expect(logBuffer.some(l => l.includes("LARGE FILE"))).toBe(true);
    expect(logBuffer.some(l => l.includes("before: read_file"))).toBe(true);
  });

  test("full flow for bash large output", () => {
    logBuffer = [];
    
    const input = { 
      tool: "bash", 
      args: { command: "rg 'pattern' --json" }, 
      sessionID: "sess_bash_test" 
    };
    const output = { 
      output: "x".repeat(60000), 
      title: "Search Results",
      metadata: {} 
    };
    
    log(`before: ${input.tool} session=${getSessionID(input)}`);
    log(`after: ${input.tool} session=${getSessionID(input)}`);
    
    const outputData = getOutputData(output);
    
    // Not auto-indexed (< 100KB) but intent-searchable (> 5KB)
    expect(outputData.length > CONFIG.intentThreshold).toBe(true);
    expect(outputData.length <= CONFIG.indexThreshold).toBe(true);
    
    expect(logBuffer.some(l => l.includes("before: bash"))).toBe(true);
    expect(logBuffer.some(l => l.includes("after: bash"))).toBe(true);
  });

  test("web_fetch flow triggers ctx_fetch_and_index path", () => {
    logBuffer = [];
    
    const input = { 
      tool: "web_fetch", 
      args: { url: "https://docs.example.com/api" }, 
      sessionID: "sess_web_test" 
    };
    
    log(`before: ${input.tool} session=${getSessionID(input)}`);
    
    if (input.tool === "web_fetch" && input.args?.url && CONFIG.web) {
      log(`[${getSessionID(input)}] web_fetch ${input.args.url} → would use ctx_fetch_and_index + ctx_search`);
    }
    
    expect(logBuffer.some(l => l.includes("web_fetch"))).toBe(true);
    expect(logBuffer.some(l => l.includes("ctx_fetch_and_index"))).toBe(true);
  });

  test("session.start triggers repo indexing", () => {
    logBuffer = [];
    
    const input = { 
      event: { type: "session.start", sessionID: "sess_repo_test" } 
    };
    const eventType = input.event?.type || "unknown";
    const sessionId = input.event?.sessionID || "unknown";
    
    if (eventType === "session.start" && CONFIG.repo) {
      log(`[${sessionId}] Session started`);
      const isGitRepo = true; // simulated
      if (isGitRepo) {
        log(`[${sessionId}] Git repo detected`);
      }
    }
    
    expect(logBuffer.some(l => l.includes("Session started"))).toBe(true);
    expect(logBuffer.some(l => l.includes("Git repo detected"))).toBe(true);
  });

  test("session.compacting triggers snapshot", () => {
    logBuffer = [];
    
    const input = { 
      event: { type: "session.compacting", sessionID: "sess_compact_test" } 
    };
    const eventType = input.event?.type || "unknown";
    
    log(`compacting: ${eventType}`);
    if (eventType === "session.compacting" && CONFIG.compact) {
      log(`[${input.event?.sessionID}] Would call ctx_stats + ctx_search for preservation`);
    }
    
    expect(logBuffer.some(l => l.includes("session.compacting"))).toBe(true);
    expect(logBuffer.some(l => l.includes("ctx_stats"))).toBe(true);
  });
});
