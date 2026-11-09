import { defineRpc } from "@getpaseo/plugin";
import { z } from "zod";
import { GroupSchema } from "./groups";

/** A group or script, by ids from the Command Center or by the name typed after /term. */
export const TargetInputSchema = z.union([
  z.object({ groupId: z.string().min(1), scriptId: z.string().min(1).optional() }),
  z.object({ query: z.string() }),
]);

export type TargetInput = z.infer<typeof TargetInputSchema>;

const RunInputSchema = z.object({ workspaceId: z.string().min(1), target: TargetInputSchema });

export type RunInput = z.infer<typeof RunInputSchema>;

export const listGroupsRpc = defineRpc({
  name: "groups.list",
  input: z.object({}),
  output: z.object({ groups: z.array(GroupSchema) }),
});

export const runScriptsRpc = defineRpc({
  name: "scripts.run",
  input: RunInputSchema,
  output: z.object({
    groupName: z.string(),
    started: z.array(z.string()),
    replaced: z.number().int(),
  }),
});

export const stopScriptsRpc = defineRpc({
  name: "scripts.stop",
  input: RunInputSchema,
  output: z.object({ groupName: z.string(), stopped: z.number().int() }),
});
