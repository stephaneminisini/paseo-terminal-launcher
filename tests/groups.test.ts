import { describe, expect, it } from "vitest";
import {
  commandEntries,
  GroupsSchema,
  parseTermArgs,
  resolveTarget,
  TargetError,
  type Group,
} from "../shared/groups";

const qai: Group = {
  id: "qai",
  name: "QAI backend",
  cwd: "~/qai",
  scripts: [
    { id: "copy", name: "copy", body: "python -m workflow.step_copy" },
    { id: "transcribe", name: "transcribe", body: "python -m workflow.step_transcribe" },
  ],
};
const web: Group = {
  id: "web",
  name: "Web",
  cwd: "",
  scripts: [
    { id: "dev", name: "dev", body: "npm run dev" },
    { id: "web-copy", name: "copy", body: "cp a b" },
  ],
};

describe("GroupsSchema", () => {
  it("seeds the QAI backend group with the 13 pipeline steps in order when empty", () => {
    const { groups } = GroupsSchema.parse({});
    expect(groups).toHaveLength(1);
    expect(groups[0].name).toBe("QAI backend");
    expect(groups[0].cwd).toBe("~/dev-fps/qai/apps/backend");
    expect(groups[0].scripts.map((s) => s.name)).toEqual([
      "step_copy_call_recording",
      "step_extract_metadata",
      "step_ingestion_rules",
      "step_transcribe_audio",
      "step_media_normalization_redaction",
      "step_translate_transcript",
      "step_process_chat",
      "step_initialize_analysis_results",
      "step_process_agentic_ai",
      "step_process_agentic_ai_results",
      "step_process_scorecard_initialization",
      "step_process_ai_automated_scorecard",
      "step_process_automated_scorecard",
    ]);
    expect(groups[0].scripts[3].body).toBe(
      "source .venv/bin/activate\npython -m workflow.step_transcribe_audio",
    );
  });

  it("keeps an explicitly empty list instead of re-seeding", () => {
    expect(GroupsSchema.parse({ groups: [] }).groups).toEqual([]);
  });

  it("rejects two groups with the same name, ignoring case", () => {
    const result = GroupsSchema.safeParse({ groups: [qai, { ...web, name: "qai BACKEND" }] });
    expect(result.success).toBe(false);
  });

  it("rejects two scripts with the same name in one group", () => {
    const dup = { ...qai, scripts: [qai.scripts[0], { ...qai.scripts[1], name: "Copy" }] };
    expect(GroupsSchema.safeParse({ groups: [dup] }).success).toBe(false);
  });

  it("allows the same script name in different groups", () => {
    expect(GroupsSchema.safeParse({ groups: [qai, web] }).success).toBe(true);
  });

  it("rejects a relative folder", () => {
    expect(GroupsSchema.safeParse({ groups: [{ ...qai, cwd: "dev/qai" }] }).success).toBe(false);
  });

  it("accepts an absolute, home-relative, or empty folder", () => {
    for (const cwd of ["/srv/qai", "~", "~/qai", ""]) {
      expect(GroupsSchema.safeParse({ groups: [{ ...qai, cwd }] }).success).toBe(true);
    }
  });

  it("rejects a blank script body", () => {
    const blank = { ...qai, scripts: [{ ...qai.scripts[0], body: "  \n " }] };
    expect(GroupsSchema.safeParse({ groups: [blank] }).success).toBe(false);
  });

  it("rejects a group without scripts", () => {
    expect(GroupsSchema.safeParse({ groups: [{ ...qai, scripts: [] }] }).success).toBe(false);
  });
});

describe("resolveTarget", () => {
  const groups = [qai, web];

  it("matches a group name case-insensitively and returns all its scripts", () => {
    const target = resolveTarget(groups, "  qai Backend ");
    expect(target.group.id).toBe("qai");
    expect(target.scripts.map((s) => s.id)).toEqual(["copy", "transcribe"]);
  });

  it("matches 'group / script' to one script of that group", () => {
    const target = resolveTarget(groups, "Web / copy");
    expect(target.group.id).toBe("web");
    expect(target.scripts.map((s) => s.id)).toEqual(["web-copy"]);
  });

  it("matches a script name that is unique across groups", () => {
    const target = resolveTarget(groups, "transcribe");
    expect(target.group.id).toBe("qai");
    expect(target.scripts.map((s) => s.id)).toEqual(["transcribe"]);
  });

  it("throws TargetError naming the groups when a script name is ambiguous", () => {
    expect(() => resolveTarget(groups, "copy")).toThrowError(TargetError);
    expect(() => resolveTarget(groups, "copy")).toThrowError(/QAI backend \/ copy.*Web \/ copy/);
  });

  it("throws TargetError when nothing matches", () => {
    expect(() => resolveTarget(groups, "nope")).toThrowError(/No group or script named "nope"/);
  });

  it("throws TargetError for an empty query", () => {
    expect(() => resolveTarget(groups, "  ")).toThrowError(/Name a group or script/);
  });
});

describe("resolveTarget by id", () => {
  it("returns the whole group without a script id", () => {
    expect(resolveTarget([qai], { groupId: "qai" }).scripts).toHaveLength(2);
  });

  it("returns one script with a script id", () => {
    const target = resolveTarget([qai], { groupId: "qai", scriptId: "transcribe" });
    expect(target.scripts.map((s) => s.name)).toEqual(["transcribe"]);
  });

  it("throws TargetError for an unknown group or script id", () => {
    expect(() => resolveTarget([qai], { groupId: "gone" })).toThrowError(TargetError);
    expect(() => resolveTarget([qai], { groupId: "qai", scriptId: "gone" })).toThrowError(
      TargetError,
    );
  });
});

describe("parseTermArgs", () => {
  it("runs by default", () => {
    expect(parseTermArgs("QAI backend")).toEqual({ action: "run", query: "QAI backend" });
  });

  it("stops with a leading 'stop' word", () => {
    expect(parseTermArgs("stop QAI backend")).toEqual({ action: "stop", query: "QAI backend" });
  });

  it("treats a lone 'stop' as a run query", () => {
    expect(parseTermArgs("stop")).toEqual({ action: "run", query: "stop" });
  });
});

describe("commandEntries", () => {
  it("builds ids Paseo accepts even when group and script ids contain underscores", () => {
    const ids = commandEntries(GroupsSchema.parse({}).groups).map((entry) => entry.id);
    for (const id of ids) expect(id).toMatch(/^[a-z][a-z0-9-]*$/);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("lists run and stop per group, then run per script", () => {
    expect(commandEntries([qai])).toEqual([
      { id: "run-group-0", title: "Run terminal group: QAI backend", action: "run", groupId: "qai" },
      { id: "stop-group-0", title: "Stop terminal group: QAI backend", action: "stop", groupId: "qai" },
      {
        id: "run-script-0-0",
        title: "Run terminal script: QAI backend / copy",
        action: "run",
        groupId: "qai",
        scriptId: "copy",
      },
      {
        id: "run-script-0-1",
        title: "Run terminal script: QAI backend / transcribe",
        action: "run",
        groupId: "qai",
        scriptId: "transcribe",
      },
    ]);
  });
});
