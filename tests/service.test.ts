import { describe, expect, it } from "vitest";
import { TargetError, type Group } from "../shared/groups";
import type { TerminalApi } from "../server/launcher";
import { createLauncherService, SettingsUnavailableError } from "../server/service";

const qai: Group = {
  id: "qai",
  name: "QAI backend",
  cwd: "/srv/qai",
  scripts: [
    { id: "a", name: "ingest", body: "echo ingest" },
    { id: "b", name: "transcribe", body: "echo transcribe" },
  ],
};

function recordingTerminals() {
  const created: string[] = [];
  const killed: string[] = [];
  const open = [{ id: "t-ingest", name: "ingest" }];
  const terminals: TerminalApi = {
    async list() {
      return { entries: open.filter((t) => !killed.includes(t.id)) };
    },
    async create({ name }) {
      created.push(name);
      return { write: () => 0, sendKeys: () => 0 };
    },
    ref(id) {
      return {
        async kill() {
          killed.push(id);
        },
      };
    },
  };
  return { terminals, created, killed };
}

function service(groups: () => Promise<Group[]>) {
  return createLauncherService({ readGroups: groups, homeDir: "/home/me" });
}

describe("createLauncherService", () => {
  it("lists the saved groups", async () => {
    expect(await service(async () => [qai]).listGroups()).toEqual({ groups: [qai] });
  });

  it("runs a group found by name and reports its name", async () => {
    const { terminals, created } = recordingTerminals();
    const result = await service(async () => [qai]).run(terminals, {
      workspaceId: "ws1",
      target: { query: "qai backend" },
    });
    expect(created).toEqual(["ingest", "transcribe"]);
    expect(result).toEqual({ groupName: "QAI backend", started: ["ingest", "transcribe"], replaced: 1 });
  });

  it("runs one script found by id", async () => {
    const { terminals, created } = recordingTerminals();
    await service(async () => [qai]).run(terminals, {
      workspaceId: "ws1",
      target: { groupId: "qai", scriptId: "b" },
    });
    expect(created).toEqual(["transcribe"]);
  });

  it("stops a group and reports how many terminals closed", async () => {
    const { terminals, killed } = recordingTerminals();
    const result = await service(async () => [qai]).stop(terminals, {
      workspaceId: "ws1",
      target: { groupId: "qai" },
    });
    expect(killed).toEqual(["t-ingest"]);
    expect(result).toEqual({ groupName: "QAI backend", stopped: 1 });
  });

  it("rejects an unknown target with TargetError and opens nothing", async () => {
    const { terminals, created } = recordingTerminals();
    await expect(
      service(async () => [qai]).run(terminals, { workspaceId: "ws1", target: { query: "nope" } }),
    ).rejects.toBeInstanceOf(TargetError);
    expect(created).toEqual([]);
  });

  it("propagates SettingsUnavailableError when the settings cannot be read", async () => {
    const { terminals } = recordingTerminals();
    const failing = service(async () => {
      throw new SettingsUnavailableError("stored data is invalid");
    });
    await expect(
      failing.run(terminals, { workspaceId: "ws1", target: { groupId: "qai" } }),
    ).rejects.toThrowError(/Terminal groups are unavailable: stored data is invalid/);
  });
});
