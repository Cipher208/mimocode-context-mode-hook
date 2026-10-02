/**
 * Integration tests — these import the REAL hook module.
 *
 * The pre-existing suite (context-mode.hook.test.ts) re-declares copies of the
 * hook's helpers, so it passes even if the hook itself is deleted. Every test in
 * this file exercises the shipped code path instead.
 *
 * Run: bun test
 */

import { test, expect, describe } from "bun:test";
import { createHooks, CONFIG, type IndexResult } from "../../hooks/context-mode";

function bigOutput(bytes: number): string {
  const line = "x".repeat(79) + "\n";
  return line.repeat(Math.ceil(bytes / 80)).slice(0, bytes);
}

function fakeIndexer(result: Partial<IndexResult> & { calls?: unknown[] }) {
  const calls: any[] = result.calls ?? [];
  return {
    calls,
    index: async (req: { content: string; source: string; project: string }) => {
      calls.push(req);
      return { ok: true, sections: 1, ...result } as IndexResult;
    },
  };
}

describe("tool.execute.after — indexes before it replaces", () => {
  test("large output is handed to the indexer and replaced with a pointer", async () => {
    const { index, calls } = fakeIndexer({ ok: true, sections: 3 });
    const hooks = createHooks({ index });

    const output = { title: "grep", output: bigOutput(CONFIG.indexThreshold + 1), metadata: {} };
    await hooks["tool.execute.after"](
      { tool: "bash", sessionID: "sess-1", callID: "c1", args: {} } as any,
      output as any,
    );

    expect(calls.length).toBe(1);
    expect(calls[0].content.length).toBeGreaterThan(CONFIG.indexThreshold);
    expect(output.output).toContain("ctx_search");
    expect(output.output).toContain(calls[0].source);
  });

  test("the source label in the pointer is the one actually indexed", async () => {
    const { index, calls } = fakeIndexer({ ok: true, sections: 1 });
    const hooks = createHooks({ index });

    const output = { title: "read", output: bigOutput(CONFIG.indexThreshold + 1), metadata: {} };
    await hooks["tool.execute.after"](
      { tool: "read", sessionID: "sess-2", callID: "c2", args: {} } as any,
      output as any,
    );

    expect(output.output).toContain(calls[0].source);
  });
});

describe("tool.execute.after — never loses data", () => {
  test("indexer failure leaves the original output untouched", async () => {
    const { index } = fakeIndexer({ ok: false, sections: 0, detail: "spawn failed" });
    const hooks = createHooks({ index });

    const original = bigOutput(CONFIG.indexThreshold + 1);
    const output = { title: "bash", output: original, metadata: {} };
    await hooks["tool.execute.after"](
      { tool: "bash", sessionID: "sess-3", callID: "c3", args: {} } as any,
      output as any,
    );

    expect(output.output).toBe(original);
    expect(output.output).not.toContain("ctx_search");
  });

  test("exit code 0 with zero sections is treated as FAILURE, not success", async () => {
    // context-mode index exits 0 even when it indexed nothing.
    const { index } = fakeIndexer({ ok: true, sections: 0 });
    const hooks = createHooks({ index });

    const original = bigOutput(CONFIG.indexThreshold + 1);
    const output = { title: "bash", output: original, metadata: {} };
    await hooks["tool.execute.after"](
      { tool: "bash", sessionID: "sess-4", callID: "c4", args: {} } as any,
      output as any,
    );

    expect(output.output).toBe(original);
  });

  test("indexer throwing does not propagate and does not touch output", async () => {
    const hooks = createHooks({
      index: async () => {
        throw new Error("boom");
      },
    });

    const original = bigOutput(CONFIG.indexThreshold + 1);
    const output = { title: "bash", output: original, metadata: {} };
    await hooks["tool.execute.after"](
      { tool: "bash", sessionID: "sess-5", callID: "c5", args: {} } as any,
      output as any,
    );

    expect(output.output).toBe(original);
  });
});

describe("tool.execute.after — does not index what it should not", () => {
  test("output below the threshold is never sent to the indexer", async () => {
    const { index, calls } = fakeIndexer({ ok: true, sections: 1 });
    const hooks = createHooks({ index });

    const output = { title: "bash", output: "small", metadata: {} };
    await hooks["tool.execute.after"](
      { tool: "bash", sessionID: "sess-6", callID: "c6", args: {} } as any,
      output as any,
    );

    expect(calls.length).toBe(0);
    expect(output.output).toBe("small");
  });

  test("write and edit are skipped", async () => {
    for (const tool of CONFIG.skipTools) {
      const { index, calls } = fakeIndexer({ ok: true, sections: 1 });
      const hooks = createHooks({ index });

      const original = bigOutput(CONFIG.indexThreshold + 1);
      const output = { title: tool, output: original, metadata: {} };
      await hooks["tool.execute.after"](
        { tool, sessionID: "sess-7", callID: "c7", args: {} } as any,
        output as any,
      );

      expect(calls.length).toBe(0);
      expect(output.output).toBe(original);
    }
  });

  test("empty output is never sent to the indexer", async () => {
    const { index, calls } = fakeIndexer({ ok: true, sections: 1 });
    const hooks = createHooks({ index });

    const output = { title: "bash", output: "", metadata: {} };
    await hooks["tool.execute.after"](
      { tool: "bash", sessionID: "sess-8", callID: "c8", args: {} } as any,
      output as any,
    );

    expect(calls.length).toBe(0);
  });
});

describe("intent search marker", () => {
  test("output above intentThreshold is marked indexed in metadata", async () => {
    const { index } = fakeIndexer({ ok: true, sections: 1 });
    const hooks = createHooks({ index });

    const output: { title: string; output: string; metadata: Record<string, unknown> } = {
      title: "bash",
      output: "y".repeat(CONFIG.intentThreshold + 10),
      metadata: {},
    };
    await hooks["tool.execute.after"](
      { tool: "bash", sessionID: "sess-9", callID: "c9", args: {} } as any,
      output as any,
    );

    expect(output.metadata.contextModeIndexed).toBe(true);
  });
});