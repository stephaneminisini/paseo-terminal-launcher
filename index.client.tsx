import type { PluginClientContext } from "@getpaseo/plugin/client";
import type { RpcInput } from "@getpaseo/plugin";
import { createCommandSync } from "./client/command-sync";
import { createSettingsScreen } from "./client/settings-screen";
import { parseTermArgs, type TermAction } from "./shared/groups";
import { listGroupsRpc, runScriptsRpc, stopScriptsRpc } from "./shared/rpc";

const KEYWORDS = ["terminal", "script", "launch", "start", "stop"];

type Rpc = PluginClientContext["rpc"];

/** Run or stop a target; errors reject and Paseo shows them in a toast. */
async function act(rpc: Rpc, action: TermAction, input: RpcInput<typeof runScriptsRpc>): Promise<void> {
  if (action === "run") await rpc(runScriptsRpc, input);
  else await rpc(stopScriptsRpc, input);
}

export default function contribute(client: PluginClientContext) {
  const commands = createCommandSync({
    listGroups: async () => (await client.rpc(listGroupsRpc, {})).groups,
    register: (entry) =>
      client.addCommandCenterItem({
        id: entry.id,
        title: entry.title,
        icon: entry.action === "run" ? "SquareTerminal" : "SquareX",
        keywords: KEYWORDS,
        context: "workspace",
        async onSelect({ rpc, workspace }) {
          const target = { groupId: entry.groupId, scriptId: entry.scriptId };
          await act(rpc, entry.action, { workspaceId: workspace.id, target });
        },
      }),
  });

  const refresh = () =>
    commands.sync().catch((error: unknown) => {
      console.error("[terminal-launcher] Could not load terminal groups", error);
    });
  void refresh();

  client.addSettingsScreen({
    id: "groups",
    title: "Terminal groups",
    icon: "SquareTerminal",
    Component: createSettingsScreen({ onSaved: () => void refresh() }),
  });
  client.addCommandCenterItem({
    id: "edit-groups",
    title: "Edit terminal groups",
    icon: "Settings",
    keywords: KEYWORDS,
    context: "global",
    onSelect: ({ openSettings }) => openSettings("groups"),
  });
  client.addCommandCenterItem({
    id: "refresh-groups",
    title: "Refresh terminal groups",
    icon: "RefreshCw",
    keywords: KEYWORDS,
    context: "global",
    onSelect: () => commands.sync(),
  });
  client.addSlashCommand({
    name: "term",
    description: "Open a terminal for each script in a saved group",
    argumentHint: "<group or script> | stop <group or script>",
    context: "workspace",
    async onSubmit({ args, rpc, workspace }) {
      const { action, query } = parseTermArgs(args);
      await act(rpc, action, { workspaceId: workspace.id, target: { query } });
    },
  });

  return () => commands.dispose();
}
