/**
 * Part-splitting for big outputs (lcm artifact 2/4, ported from the opencode
 * plugin where it is proven live: 150KB blob -> 6 parts, needle found).
 * Run: bun test
 */
import { test, expect, describe } from "bun:test";
import { createHooks, CONFIG, splitParts } from "../../hooks/context-mode";

function fakeIndexer() {
  const calls: any[] = [];
  return {
    calls,
    index: async (req: { content: string; source: string; project: string }) => {
      calls.push(req);
      return { ok: true, sections: 2 };
    },
  };
}

describe("splitParts", () => {
  test("small text stays one part", () => {
    expect(splitParts("abc", 32768)).toEqual(["abc"]);
  });

  test("150KB blob without structure becomes 4+ parts, lossless", () => {
    const big = "x".repeat(150 * 1024);
    const parts = splitParts(big, 32 * 1024);
    expect(parts.length).toBeGreaterThanOrEqual(4);
    expect(parts.join("")).toBe(big);
  });

  test("splits on line boundaries when possible", () => {
    const lines = Array.from({ length: 100 }, (_, i) => `line-${i}-` + "y".repeat(999));
    const content = lines.join("\n");
    const parts = splitParts(content, 32 * 1024);
    expect(parts.length).toBeGreaterThan(1);
    expect(parts.join("\n")).toBe(content);
  });
});

describe("tool.execute.after — indexes big outputs in parts", () => {
  test("150KB output is indexed as partN sources, pointer names the base", async () => {
    const { index, calls } = fakeIndexer();
    const hooks = createHooks({ index });

    const output = { title: "bash", output: "z".repeat(CONFIG.indexThreshold + 50 * 1024), metadata: {} };
    await hooks["tool.execute.after"](
      { tool: "bash", sessionID: "sess-parts", callID: "c9", args: {} } as any,
      output as any,
    );

    expect(calls.length).toBeGreaterThan(1);
    expect(calls[0].source).toMatch(/#part1$/);
    const base = calls[0].source.replace(/#part1$/, "");
    expect(output.output).toContain(base);
    expect(output.output).toContain("part(s)");
  });

  test("just-over-threshold output is still split (parts cover the body)", async () => {
    const { index, calls } = fakeIndexer();
    const hooks = createHooks({ index });

    const line = "w".repeat(79) + "\n";
    const body = line.repeat(Math.ceil((CONFIG.indexThreshold + 10 * 1024) / 80));
    const output = { title: "bash", output: body, metadata: {} };
    await hooks["tool.execute.after"](
      { tool: "bash", sessionID: "sess-one", callID: "c10", args: {} } as any,
      output as any,
    );

    expect(calls.length).toBeGreaterThan(1);
    expect(calls.map((c: any) => c.content).join("\n")).toBe(body);
    expect(output.output).toContain(`${calls.length} part(s)`);
  });
});
