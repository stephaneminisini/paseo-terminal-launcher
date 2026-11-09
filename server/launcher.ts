import { join } from "node:path";
import type { Group, Script } from "../shared/groups";

/** The slice of the SDK's `paseo.terminals` this plugin uses. */
export interface TerminalApi {
  list(options: { workspaceId: string }): Promise<{ entries: Array<{ id: string; name: string }> }>;
  create(options: {
    workspaceId: string;
    name: string;
    cwd?: string;
    command: string;
  }): Promise<{ write(data: string): number; sendKeys(keys: readonly string[]): number }>;
  ref(id: string): { kill(): Promise<void> };
}

/**
 * Turn a group folder into the terminal's working directory.
 *
 * @returns The absolute path, or `undefined` for an empty folder, which means the workspace directory.
 */
export function resolveCwd(cwd: string, homeDir: string): string | undefined {
  if (cwd === "") return undefined;
  if (cwd === "~") return homeDir;
  if (cwd.startsWith("~/")) return join(homeDir, cwd.slice(2));
  return cwd;
}

function shellQuote(value: string): string {
  return `'${value.replaceAll("'", `'\\''`)}'`;
}

function scriptLines(body: string, cwd: string | undefined): string[] {
  const lines = body.trimEnd().split(/\r?\n/);
  return cwd === undefined ? lines : [`cd ${shellQuote(cwd)}`, ...lines];
}

async function killNamed(
  terminals: TerminalApi,
  workspaceId: string,
  scripts: Script[],
): Promise<number> {
  const names = new Set(scripts.map((script) => script.name));
  const { entries } = await terminals.list({ workspaceId });
  const matching = entries.filter((entry) => names.has(entry.name));
  await Promise.all(matching.map((entry) => terminals.ref(entry.id).kill()));
  return matching.length;
}

/**
 * Open one interactive bash terminal per script and type the script into it.
 *
 * Open terminals in the workspace that carry a script's name are killed first, so running a group
 * again restarts it. Bash stays open after the script ends or is interrupted, keeping its output
 * on screen and the commands in history.
 *
 * Terminals start in the workspace folder and `cd` to the group folder as their first command:
 * Paseo 0.15 pushes terminal changes to the app only for terminals that start inside the
 * workspace folder, so one started elsewhere never gets a tab.
 *
 * @throws Errors from the terminal API, such as an unknown or archived workspace.
 */
export async function runScripts(options: {
  terminals: TerminalApi;
  workspaceId: string;
  group: Group;
  scripts: Script[];
  homeDir: string;
}): Promise<{ started: string[]; replaced: number }> {
  const { terminals, workspaceId, group, scripts, homeDir } = options;
  const replaced = await killNamed(terminals, workspaceId, scripts);
  const cwd = resolveCwd(group.cwd, homeDir);
  // Sequential so the tabs open in list order.
  for (const script of scripts) {
    const terminal = await terminals.create({ workspaceId, name: script.name, command: "bash" });
    for (const line of scriptLines(script.body, cwd)) {
      terminal.write(line);
      terminal.sendKeys(["Enter"]);
    }
  }
  return { started: scripts.map((script) => script.name), replaced };
}

/**
 * Kill the workspace terminals named after the given scripts.
 *
 * @throws Errors from the terminal API.
 */
export async function stopScripts(options: {
  terminals: TerminalApi;
  workspaceId: string;
  scripts: Script[];
}): Promise<{ stopped: number }> {
  return { stopped: await killNamed(options.terminals, options.workspaceId, options.scripts) };
}
