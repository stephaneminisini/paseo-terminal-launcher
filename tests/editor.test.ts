import { describe, expect, it } from "vitest";
import type { Group } from "../shared/groups";
import {
  addGroup,
  addScript,
  fieldErrors,
  moveScript,
  removeGroup,
  removeScript,
  updateGroup,
  updateScript,
} from "../shared/editor";

const ids = () => {
  let n = 0;
  return () => `id${++n}`;
};

const group: Group = {
  id: "g",
  name: "QAI backend",
  cwd: "~/qai",
  scripts: [
    { id: "a", name: "a", body: "echo a" },
    { id: "b", name: "b", body: "echo b" },
    { id: "c", name: "c", body: "echo c" },
  ],
};

describe("draft editing", () => {
  it("adds a group with one empty script using fresh ids", () => {
    const next = addGroup([group], ids());
    expect(next).toHaveLength(2);
    expect(next[1]).toEqual({
      id: "id1",
      name: "",
      cwd: "",
      scripts: [{ id: "id2", name: "", body: "" }],
    });
  });

  it("removes a group by id", () => {
    expect(removeGroup([group], "g")).toEqual([]);
  });

  it("updates group fields without touching others", () => {
    const [next] = updateGroup([group], "g", { cwd: "/srv" });
    expect(next.cwd).toBe("/srv");
    expect(next.name).toBe("QAI backend");
  });

  it("appends a script to the end of a group", () => {
    const [next] = addScript([group], "g", ids());
    expect(next.scripts.map((s) => s.id)).toEqual(["a", "b", "c", "id1"]);
  });

  it("removes and updates scripts by id", () => {
    const [removed] = removeScript([group], "g", "b");
    expect(removed.scripts.map((s) => s.id)).toEqual(["a", "c"]);
    const [updated] = updateScript([group], "g", "c", { body: "echo C" });
    expect(updated.scripts[2]).toEqual({ id: "c", name: "c", body: "echo C" });
  });

  it("moves a script up or down and ignores moves past either end", () => {
    expect(moveScript([group], "g", "b", -1)[0].scripts.map((s) => s.id)).toEqual(["b", "a", "c"]);
    expect(moveScript([group], "g", "b", 1)[0].scripts.map((s) => s.id)).toEqual(["a", "c", "b"]);
    expect(moveScript([group], "g", "a", -1)[0].scripts.map((s) => s.id)).toEqual(["a", "b", "c"]);
    expect(moveScript([group], "g", "c", 1)[0].scripts.map((s) => s.id)).toEqual(["a", "b", "c"]);
  });

  it("does not mutate the input", () => {
    const before = structuredClone([group]);
    moveScript([group], "g", "b", 1);
    updateScript([group], "g", "a", { name: "z" });
    expect([group]).toEqual(before);
  });
});

describe("fieldErrors", () => {
  it("returns no errors for a valid draft", () => {
    expect(fieldErrors([group])).toEqual({});
  });

  it("keys errors by group id and script id", () => {
    const bad: Group = {
      ...group,
      cwd: "relative",
      scripts: [group.scripts[0], { id: "b", name: "A", body: " " }],
    };
    expect(fieldErrors([bad])).toEqual({
      "g.cwd": "Use an absolute path, a path starting with ~/, or leave it empty",
      "g.script.b.name": "Script name is already used: A",
      "g.script.b.body": "Enter the script",
    });
  });

  it("reports a duplicate group name and a group without scripts", () => {
    const other: Group = { id: "h", name: "qai backend", cwd: "", scripts: [] };
    expect(fieldErrors([group, other])).toEqual({
      "h.name": "Group name is already used: qai backend",
      "h.scripts": "Add at least one script",
    });
  });
});
