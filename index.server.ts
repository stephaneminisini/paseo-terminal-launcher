import { homedir } from "node:os";
import type { PluginServerContext } from "@getpaseo/plugin/server";
import { createLauncherService, SettingsUnavailableError } from "./server/service";
import { groupsSettings } from "./shared/groups";
import { listGroupsRpc, runScriptsRpc, stopScriptsRpc } from "./shared/rpc";

export default function contribute(server: PluginServerContext) {
  const settings = server.registerSettings(groupsSettings);

  const service = createLauncherService({
    async readGroups() {
      const state = await settings.read();
      if (state.status !== "ready") throw new SettingsUnavailableError(state.error);
      return state.values.groups;
    },
    homeDir: homedir(),
  });

  server.handle(listGroupsRpc, () => service.listGroups());
  server.handle(runScriptsRpc, (input, { paseo }) => service.run(paseo.terminals, input));
  server.handle(stopScriptsRpc, (input, { paseo }) => service.stop(paseo.terminals, input));
  return () => {};
}
