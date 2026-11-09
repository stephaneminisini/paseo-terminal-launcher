import { type Group, GroupsSchema, type Script } from "./groups";

/** Pure edits on the settings draft. Each returns a new array and leaves its input untouched. */

export function addGroup(groups: Group[], newId: () => string): Group[] {
  return [...groups, { id: newId(), name: "", cwd: "", scripts: [{ id: newId(), name: "", body: "" }] }];
}

export function removeGroup(groups: Group[], groupId: string): Group[] {
  return groups.filter((group) => group.id !== groupId);
}

export function updateGroup(
  groups: Group[],
  groupId: string,
  patch: Partial<Pick<Group, "name" | "cwd">>,
): Group[] {
  return groups.map((group) => (group.id === groupId ? { ...group, ...patch } : group));
}

function editScripts(groups: Group[], groupId: string, edit: (scripts: Script[]) => Script[]): Group[] {
  return groups.map((group) => (group.id === groupId ? { ...group, scripts: edit(group.scripts) } : group));
}

export function addScript(groups: Group[], groupId: string, newId: () => string): Group[] {
  return editScripts(groups, groupId, (scripts) => [...scripts, { id: newId(), name: "", body: "" }]);
}

export function removeScript(groups: Group[], groupId: string, scriptId: string): Group[] {
  return editScripts(groups, groupId, (scripts) => scripts.filter((script) => script.id !== scriptId));
}

export function updateScript(
  groups: Group[],
  groupId: string,
  scriptId: string,
  patch: Partial<Pick<Script, "name" | "body">>,
): Group[] {
  return editScripts(groups, groupId, (scripts) =>
    scripts.map((script) => (script.id === scriptId ? { ...script, ...patch } : script)),
  );
}

/** Move a script one place up (-1) or down (1); a move past either end changes nothing. */
export function moveScript(groups: Group[], groupId: string, scriptId: string, offset: -1 | 1): Group[] {
  return editScripts(groups, groupId, (scripts) => {
    const from = scripts.findIndex((script) => script.id === scriptId);
    const to = from + offset;
    if (from === -1 || to < 0 || to >= scripts.length) return scripts;
    const next = [...scripts];
    [next[from], next[to]] = [next[to], next[from]];
    return next;
  });
}

/**
 * Validation messages for the draft, keyed by field.
 *
 * Keys are `<groupId>.name`, `<groupId>.cwd`, `<groupId>.scripts`, and
 * `<groupId>.script.<scriptId>.name` or `.body`. The first message for a field wins.
 */
export function fieldErrors(groups: Group[]): Record<string, string> {
  const result = GroupsSchema.safeParse({ groups });
  if (result.success) return {};
  const errors: Record<string, string> = {};
  for (const issue of result.error.issues) {
    const key = fieldKey(groups, issue.path);
    if (key && !(key in errors)) errors[key] = issue.message;
  }
  return errors;
}

function fieldKey(groups: Group[], path: PropertyKey[]): string | undefined {
  const [root, groupIndex, field, scriptIndex, scriptField] = path;
  if (root !== "groups" || typeof groupIndex !== "number") return undefined;
  const group = groups[groupIndex];
  if (!group) return undefined;
  if (field !== "scripts" || scriptIndex === undefined) return `${group.id}.${String(field)}`;
  const script = typeof scriptIndex === "number" ? group.scripts[scriptIndex] : undefined;
  return script ? `${group.id}.script.${script.id}.${String(scriptField)}` : undefined;
}
