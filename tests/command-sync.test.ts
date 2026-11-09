import { describe, expect, it } from "vitest";
import type { CommandEntry, Group } from "../shared/groups";
import { createCommandSync } from "../client/command-sync";

const group = (id: string, name: string): Group => ({
  id,
  name,
  cwd: "",
  scripts: [{ id: "s", name: "s", body: "echo" }],
});

function harness(responses: Array<Group[] | Error>) {
  const active = new Map<string, CommandEntry>();
  let calls = 0;
  const sync = createCommandSync({
    async listGroups() {
      const next = responses[Math.min(calls++, responses.length - 1)];
      if (next instanceof Error) throw next;
      return next;
    },
    register(entry) {
      active.set(entry.id, entry);
      return () => active.delete(entry.id);
    },
  });
  return { sync, active };
}

describe("createCommandSync", () => {
  it("registers one command per entry", async () => {
    const { sync, active } = harness([[group("q", "QAI")]]);
    await sync.sync();
    expect([...active.keys()]).toEqual(["run-group-0", "stop-group-0", "run-script-0-0"]);
  });

  it("replaces the previous commands on the next sync", async () => {
    const { sync, active } = harness([[group("q", "QAI")], [group("w", "Web")]]);
    await sync.sync();
    await sync.sync();
    expect([...active.values()].map((entry) => entry.title)).toEqual([
      "Run terminal group: Web",
      "Stop terminal group: Web",
      "Run terminal script: Web / s",
    ]);
  });

  it("keeps the current commands and rejects when listing fails", async () => {
    const { sync, active } = harness([[group("q", "QAI")], new Error("offline")]);
    await sync.sync();
    await expect(sync.sync()).rejects.toThrowError("offline");
    expect(active.size).toBe(3);
  });

  it("removes every command on dispose and ignores a sync that finishes afterwards", async () => {
    const { sync, active } = harness([[group("q", "QAI")]]);
    await sync.sync();
    const pending = sync.sync();
    sync.dispose();
    await pending;
    expect(active.size).toBe(0);
  });
});
