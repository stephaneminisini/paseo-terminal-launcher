/**
 * Manual smoke test against a running daemon: opens two throwaway terminals with the real
 * launcher while watching the workspace the way the app does, prints what each terminal shows,
 * then stops them. The group folder is outside the workspace on purpose: the app must still be
 * told about the new terminals.
 *
 * Usage: npx tsx scripts/smoke.mts <workspaceId> [ws://127.0.0.1:6767/ws]
 */
import { homedir } from "node:os";
import { createPaseoApi } from "@getpaseo/client";
import { DaemonClient } from "@getpaseo/client/internal/daemon-client";
import type { Group } from "../shared/groups";
import { runScripts, stopScripts } from "../server/launcher";

const [workspaceId, url = "ws://127.0.0.1:6767/ws"] = process.argv.slice(2);
if (!workspaceId) {
  console.error("Usage: npx tsx scripts/smoke.mts <workspaceId> [url]");
  process.exit(2);
}

const group: Group = {
  id: "smoke",
  name: "Smoke",
  cwd: "/tmp",
  scripts: [
    { id: "one", name: "tl-smoke-1", body: "echo one-$((40+2))\npwd" },
    { id: "two", name: "tl-smoke-2", body: "echo two-$BASH_VERSION" },
  ],
};
const names = group.scripts.map((script) => script.name);
const wait = () => new Promise((resolve) => setTimeout(resolve, 1500));

const daemon = new DaemonClient({ url, clientId: `tl-smoke-${Date.now()}`, clientType: "cli" });
await daemon.connect();
const paseo = createPaseoApi(daemon);
const workspace = (await paseo.workspaces.list()).entries.find((entry) => entry.id === workspaceId);
if (!workspace) throw new Error(`Unknown workspace ${workspaceId}`);

// The app's terminal tabs come from this subscription.
const root = workspace.workspaceDirectory ?? workspace.projectRootPath;
const watch = daemon.observeTerminals({ cwd: root, workspaceId });
await watch.ready;
let pushed: string[] = [];
watch.subscribe({
  snapshot: () => {},
  update: (message) => {
    if (message.type === "terminals_changed") pushed = message.payload.terminals.map((t) => t.name);
  },
});

try {
  console.log("run", await runScripts({ terminals: paseo.terminals, workspaceId, group, scripts: group.scripts, homeDir: homedir() }));
  await wait();
  const seen = names.every((name) => pushed.includes(name));
  console.log(seen ? "PASS the app was told about both terminals" : `FAIL app saw only: ${JSON.stringify(pushed)}`);
  const { entries } = await paseo.terminals.list({ workspaceId });
  for (const entry of entries.filter((e) => names.includes(e.name))) {
    const { lines } = await paseo.terminals.ref(entry.id).capture();
    console.log(`--- ${entry.name}\n${lines.filter((line) => line.trim()).join("\n")}`);
  }
  console.log("stop", await stopScripts({ terminals: paseo.terminals, workspaceId, scripts: group.scripts }));
  await wait();
  console.log(names.some((name) => pushed.includes(name)) ? "FAIL app still lists them" : "PASS the app was told they closed");
} finally {
  await watch.release();
  await daemon.close();
}
