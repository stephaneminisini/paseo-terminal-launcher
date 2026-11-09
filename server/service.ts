import { type Group, resolveTarget, type Target } from "../shared/groups";
import type { RunInput, TargetInput } from "../shared/rpc";
import { runScripts, stopScripts, type TerminalApi } from "./launcher";

/** The saved terminal groups could not be read, for example because the stored data is invalid. */
export class SettingsUnavailableError extends Error {
  override name = "SettingsUnavailableError";

  constructor(reason: string) {
    super(`Terminal groups are unavailable: ${reason}`);
  }
}

function toTarget(groups: Group[], target: TargetInput): Target {
  return resolveTarget(groups, "query" in target ? target.query : target);
}

/**
 * Daemon-side handlers behind the plugin RPCs.
 *
 * Every method can throw `SettingsUnavailableError` from `readGroups`. `run` and `stop` also throw
 * `TargetError` when the target does not resolve, and terminal API errors from the daemon.
 */
export function createLauncherService(deps: {
  readGroups: () => Promise<Group[]>;
  homeDir: string;
}) {
  return {
    async listGroups(): Promise<{ groups: Group[] }> {
      return { groups: await deps.readGroups() };
    },

    async run(terminals: TerminalApi, input: RunInput) {
      const { group, scripts } = toTarget(await deps.readGroups(), input.target);
      const result = await runScripts({
        terminals,
        workspaceId: input.workspaceId,
        group,
        scripts,
        homeDir: deps.homeDir,
      });
      return { groupName: group.name, ...result };
    },

    async stop(terminals: TerminalApi, input: RunInput) {
      const { group, scripts } = toTarget(await deps.readGroups(), input.target);
      const result = await stopScripts({ terminals, workspaceId: input.workspaceId, scripts });
      return { groupName: group.name, ...result };
    },
  };
}
