import assert from "node:assert/strict";
import { test } from "node:test";
import type { SlotContribution } from "@neton/application-client-contract";
import { selectSlotContributions } from "../slots";

const c = (id: string, extra: Partial<SlotContribution> = {}): SlotContribution => ({ target: "public.object.after", id, entry: id, rendering: "server", ...extra });
const summary = { ref: { type: "content.item", id: "1" }, exists: true, visible: true, capabilities: ["comment"] };

test("filters by target, capability, object type and hide; orders by config then order then id", () => {
  const all = [
    c("comment.thread", { capability: "comment", order: 10 }),
    c("interaction.favorite", { capability: "favorite" }),
    c("content.related", { objectTypes: ["content.item"], order: 50 }),
    c("x.video-only", { objectTypes: ["content.video"] }),
    c("y.other-slot", { target: "public.object.toolbar" }),
    c("z.hidden"),
  ];
  const picked = selectSlotContributions("public.object.after", all, { summary }, { hide: ["z.hidden"] }).map((s) => s.id);
  assert.deepEqual(picked, ["comment.thread", "content.related"]);
  const reordered = selectSlotContributions("public.object.after", all, { summary }, { order: { "public.object.after": ["content.related"] }, hide: ["z.hidden"] }).map((s) => s.id);
  assert.deepEqual(reordered, ["content.related", "comment.thread"]);
});

test("capability contributions need an existing, visible object", () => {
  const all = [c("comment.thread", { capability: "comment" })];
  assert.deepEqual(selectSlotContributions("public.object.after", all, { summary: { ...summary, visible: false } }), []);
  assert.deepEqual(selectSlotContributions("public.object.after", all, {}), []);
});
