import { type CommandEntry, commandEntries, type Group } from "../shared/groups";

/**
 * Keep one Command Center item per entry in step with the saved groups.
 *
 * `sync()` replaces the registered items with the current list. It rejects with the listing
 * error and keeps the previous items when the groups cannot be read. After `dispose()` every item
 * is removed and a sync still in flight registers nothing.
 */
export function createCommandSync(deps: {
  listGroups: () => Promise<Group[]>;
  register: (entry: CommandEntry) => () => void;
}) {
  let removers: Array<() => void> = [];
  let disposed = false;

  function clear() {
    for (const remove of removers) remove();
    removers = [];
  }

  return {
    async sync(): Promise<void> {
      const groups = await deps.listGroups();
      if (disposed) return;
      clear();
      removers = commandEntries(groups).map((entry) => deps.register(entry));
    },
    dispose(): void {
      disposed = true;
      clear();
    },
  };
}
