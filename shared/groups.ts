import { defineSettings } from "@getpaseo/plugin";
import { z } from "zod";

/** Steps of the main QAI state machine (infra/cdk/data/sfn_qai.json), in pipeline order. */
const QAI_STEPS = [
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
];

const NameSchema = z.string().trim().min(1, "Enter a name").max(60, "Use 60 characters or fewer");

export const ScriptSchema = z.object({
  id: z.string().min(1),
  name: NameSchema,
  body: z.string().refine((body) => body.trim().length > 0, "Enter the script"),
});

export const GroupSchema = z.object({
  id: z.string().min(1),
  name: NameSchema,
  /** Working directory on the daemon host; empty means the workspace directory. */
  cwd: z
    .string()
    .trim()
    .refine(
      (cwd) => cwd === "" || cwd === "~" || cwd.startsWith("~/") || cwd.startsWith("/"),
      "Use an absolute path, a path starting with ~/, or leave it empty",
    ),
  scripts: z.array(ScriptSchema).min(1, "Add at least one script"),
});

export type Script = z.infer<typeof ScriptSchema>;
export type Group = z.infer<typeof GroupSchema>;

export const DEFAULT_GROUPS: Group[] = [
  {
    id: "qai-backend",
    name: "QAI backend",
    cwd: "~/dev-fps/qai/apps/backend",
    scripts: QAI_STEPS.map((step) => ({
      id: step,
      name: step,
      body: `source .venv/bin/activate\npython -m workflow.${step}`,
    })),
  },
];

/** Compare names the way users perceive them: case and surrounding spaces ignored. */
export function nameKey(name: string): string {
  return name.trim().toLowerCase();
}

function addDuplicateIssues(
  names: string[],
  label: string,
  path: (index: number) => (string | number)[],
  context: z.RefinementCtx,
): void {
  const seen = new Set<string>();
  names.forEach((name, index) => {
    const key = nameKey(name);
    if (seen.has(key)) {
      context.addIssue({ code: "custom", message: `${label} is already used: ${name}`, path: path(index) });
    }
    seen.add(key);
  });
}

export const GroupsSchema = z
  .object({ groups: z.array(GroupSchema).default(DEFAULT_GROUPS) })
  .superRefine(({ groups }, context) => {
    addDuplicateIssues(
      groups.map((group) => group.name),
      "Group name",
      (index) => ["groups", index, "name"],
      context,
    );
    groups.forEach((group, groupIndex) =>
      addDuplicateIssues(
        group.scripts.map((script) => script.name),
        "Script name",
        (index) => ["groups", groupIndex, "scripts", index, "name"],
        context,
      ),
    );
  });

export type Groups = z.infer<typeof GroupsSchema>;

export const groupsSettings = defineSettings({
  id: "groups",
  scope: "host",
  version: 1,
  schema: GroupsSchema,
});

/** A group or script the user asked for that does not resolve to exactly one target. */
export class TargetError extends Error {
  override name = "TargetError";
}

export interface Target {
  group: Group;
  scripts: Script[];
}

export type TargetRef = string | { groupId: string; scriptId?: string };

/**
 * Find the group or script a user asked for.
 *
 * A string matches, in order: a group name, "group / script", then a script name that is unique
 * across groups. Matching ignores case and surrounding spaces. An id reference selects a group,
 * or one of its scripts when `scriptId` is given.
 *
 * @throws {TargetError} When the query is empty, matches nothing, or matches scripts in several groups.
 */
export function resolveTarget(groups: Group[], ref: TargetRef): Target {
  return typeof ref === "string" ? resolveByName(groups, ref) : resolveById(groups, ref);
}

function resolveById(groups: Group[], ref: { groupId: string; scriptId?: string }): Target {
  const group = groups.find((candidate) => candidate.id === ref.groupId);
  if (!group) throw new TargetError("That terminal group no longer exists");
  if (ref.scriptId === undefined) return { group, scripts: group.scripts };
  const script = group.scripts.find((candidate) => candidate.id === ref.scriptId);
  if (!script) throw new TargetError(`That script no longer exists in ${group.name}`);
  return { group, scripts: [script] };
}

function resolveByName(groups: Group[], query: string): Target {
  const key = nameKey(query);
  if (key === "") throw new TargetError("Name a group or script, for example /term QAI backend");

  const group = groups.find((candidate) => nameKey(candidate.name) === key);
  if (group) return { group, scripts: group.scripts };

  const slash = key.indexOf("/");
  if (slash !== -1) {
    const groupKey = nameKey(key.slice(0, slash));
    const scriptKey = nameKey(key.slice(slash + 1));
    const owner = groups.find((candidate) => nameKey(candidate.name) === groupKey);
    const script = owner?.scripts.find((candidate) => nameKey(candidate.name) === scriptKey);
    if (owner && script) return { group: owner, scripts: [script] };
  }

  const matches = groups.flatMap((owner) =>
    owner.scripts
      .filter((script) => nameKey(script.name) === key)
      .map((script) => ({ group: owner, scripts: [script] })),
  );
  if (matches.length === 1) return matches[0];
  if (matches.length > 1) {
    const choices = matches.map((match) => `${match.group.name} / ${match.scripts[0].name}`);
    throw new TargetError(`"${query.trim()}" is in several groups. Use one of: ${choices.join(", ")}`);
  }
  throw new TargetError(`No group or script named "${query.trim()}"`);
}

export type TermAction = "run" | "stop";

/** Split `/term` arguments into an action and the group or script name. */
export function parseTermArgs(args: string): { action: TermAction; query: string } {
  const match = /^stop\s+(.+)$/i.exec(args.trim());
  return match ? { action: "stop", query: match[1] } : { action: "run", query: args.trim() };
}

export interface CommandEntry {
  id: string;
  title: string;
  action: TermAction;
  groupId: string;
  scriptId?: string;
}

/**
 * Command Center entries: run and stop for each group, then run for each script.
 *
 * Entry ids use positions because Paseo accepts only `[a-z][a-z0-9-]*`; the group and script ids
 * they carry for the RPC can be anything.
 */
export function commandEntries(groups: Group[]): CommandEntry[] {
  return groups.flatMap((group, groupIndex) => [
    { id: `run-group-${groupIndex}`, title: `Run terminal group: ${group.name}`, action: "run", groupId: group.id },
    { id: `stop-group-${groupIndex}`, title: `Stop terminal group: ${group.name}`, action: "stop", groupId: group.id },
    ...group.scripts.map(
      (script, scriptIndex): CommandEntry => ({
        id: `run-script-${groupIndex}-${scriptIndex}`,
        title: `Run terminal script: ${group.name} / ${script.name}`,
        action: "run",
        groupId: group.id,
        scriptId: script.id,
      }),
    ),
  ]);
}
