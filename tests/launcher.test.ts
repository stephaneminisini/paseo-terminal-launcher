import { describe, expect, it } from "vitest";
import type { Group } from "../shared/groups";
import { resolveCwd, runScripts, stopScripts, type TerminalApi } from "../server/launcher";

interface FakeTerminal {
  id: string;
  workspaceId: string;
  name: string;
  cwd?: string;
  command?: string;
  input: string[];
  killed: boolean;
}

/** In-memory stand-in for the SDK terminal API: records creation, input, and kills. */
function fakeTerminals(existing: Array<{ id: string; workspaceId: string; name: string }> = []) {
  const terminals: FakeTerminal[] = existing.map((t) => ({ ...t, input: [], killed: false }));
  let next = 1;
  const handle = (terminal: FakeTerminal) => ({
    write(data: string) {
      terminal.input.push(data);
      return data.length;
    },
    sendKeys(keys: readonly string[]) {
      terminal.input.push(...keys.map((key) => `<${key}>`));
      return keys.length;
    },
    async kill() {
      terminal.killed = true;
    },
  });
  const api: TerminalApi = {
    async list({ workspaceId }) {
      const entries = terminals
        .filter((t) => t.workspaceId === workspaceId && !t.killed)
        .map((t) => ({ id: t.id, workspaceId: t.workspaceId, name: t.name, cwd: t.cwd ?? "/" }));
      return { entries };
    },
    async create(options) {
      const terminal: FakeTerminal = { id: `new-${next++}`, input: [], killed: false, ...options };
      terminals.push(terminal);
      return handle(terminal);
    },
    ref(id) {
      const terminal = terminals.find((t) => t.id === id);
      if (!terminal) throw new Error(`unknown terminal ${id}`);
      return handle(terminal);
    },
  };
  return { api, terminals };
}

const group: Group = {
  id: "qai",
  name: "QAI backend",
  cwd: "~/qai",
  scripts: [
    { id: "a", name: "ingest", body: "source .venv/bin/activate\npython -m workflow.ingest\n\n" },
    { id: "b", name: "transcribe", body: "python -m workflow.transcribe" },
  ],
};

describe("resolveCwd", () => {
  it("expands ~ and ~/ against the home directory", () => {
    expect(resolveCwd("~", "/home/me")).toBe("/home/me");
    expect(resolveCwd("~/qai", "/home/me")).toBe("/home/me/qai");
  });

  it("keeps absolute paths and maps empty to the workspace directory", () => {
    expect(resolveCwd("/srv/qai", "/home/me")).toBe("/srv/qai");
    expect(resolveCwd("", "/home/me")).toBeUndefined();
  });
});

describe("runScripts", () => {
  it("opens one bash terminal per script, in order, named after the script, in the workspace folder", async () => {
    // Paseo 0.15 only tells the app about terminals that start inside the workspace folder, so
    // the terminal starts there and changes to the group folder itself.
    const { api, terminals } = fakeTerminals();
    await runScripts({ terminals: api, workspaceId: "ws1", group, scripts: group.scripts, homeDir: "/home/me" });
    expect(terminals.map((t) => [t.name, t.cwd, t.command, t.workspaceId])).toEqual([
      ["ingest", undefined, "bash", "ws1"],
      ["transcribe", undefined, "bash", "ws1"],
    ]);
  });

  it("changes to the group folder, then types each script line followed by Enter", async () => {
    const { api, terminals } = fakeTerminals();
    await runScripts({ terminals: api, workspaceId: "ws1", group, scripts: group.scripts, homeDir: "/h" });
    expect(terminals[0].input).toEqual([
      "cd '/h/qai'",
      "<Enter>",
      "source .venv/bin/activate",
      "<Enter>",
      "python -m workflow.ingest",
      "<Enter>",
    ]);
  });

  it("skips the cd when the group folder is empty", async () => {
    const { api, terminals } = fakeTerminals();
    const here = { ...group, cwd: "" };
    await runScripts({ terminals: api, workspaceId: "ws1", group: here, scripts: [here.scripts[1]], homeDir: "/h" });
    expect(terminals[0].input).toEqual(["python -m workflow.transcribe", "<Enter>"]);
  });

  it("quotes a folder containing spaces and single quotes for bash", async () => {
    const { api, terminals } = fakeTerminals();
    const odd = { ...group, cwd: "/srv/it's here" };
    await runScripts({ terminals: api, workspaceId: "ws1", group: odd, scripts: [odd.scripts[1]], homeDir: "/h" });
    expect(terminals[0].input[0]).toBe("cd '/srv/it'\\''s here'");
  });

  it("replaces open terminals with the same names in that workspace only", async () => {
    const { api, terminals } = fakeTerminals([
      { id: "old-ingest", workspaceId: "ws1", name: "ingest" },
      { id: "mine", workspaceId: "ws1", name: "my shell" },
      { id: "other-ws", workspaceId: "ws2", name: "ingest" },
    ]);
    const result = await runScripts({
      terminals: api,
      workspaceId: "ws1",
      group,
      scripts: group.scripts,
      homeDir: "/h",
    });
    const byId = (id: string) => terminals.find((t) => t.id === id);
    expect(byId("old-ingest")?.killed).toBe(true);
    expect(byId("mine")?.killed).toBe(false);
    expect(byId("other-ws")?.killed).toBe(false);
    expect(result).toEqual({ started: ["ingest", "transcribe"], replaced: 1 });
  });

  it("runs only the given scripts when a single script is targeted", async () => {
    const { api, terminals } = fakeTerminals();
    await runScripts({ terminals: api, workspaceId: "ws1", group, scripts: [group.scripts[1]], homeDir: "/h" });
    expect(terminals.map((t) => t.name)).toEqual(["transcribe"]);
  });
});

describe("stopScripts", () => {
  it("kills the workspace terminals named after the scripts and reports how many", async () => {
    const { api, terminals } = fakeTerminals([
      { id: "t1", workspaceId: "ws1", name: "ingest" },
      { id: "t2", workspaceId: "ws1", name: "transcribe" },
      { id: "t3", workspaceId: "ws1", name: "my shell" },
    ]);
    const result = await stopScripts({ terminals: api, workspaceId: "ws1", scripts: group.scripts });
    expect(terminals.filter((t) => t.killed).map((t) => t.id)).toEqual(["t1", "t2"]);
    expect(result).toEqual({ stopped: 2 });
  });

  it("reports zero when none of the terminals are open", async () => {
    const { api } = fakeTerminals();
    expect(await stopScripts({ terminals: api, workspaceId: "ws1", scripts: group.scripts })).toEqual({
      stopped: 0,
    });
  });
});
