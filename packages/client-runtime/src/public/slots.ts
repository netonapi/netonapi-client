/**
 * 插槽分发规则（public-routes §10.2）：对象插槽一律以 ObjectRef 为参数，贡献方只认对象、不认识页面。
 * 这里是纯函数（底座 app 用构建期注册表调用它），可单测。
 */
import type { SlotContribution } from "@neton/application-client-contract";
import type { ObjectSummary } from "./types";

export interface SlotSiteConfig { order?: Record<string, string[]>; hide?: string[] }

/**
 * 某插槽里、对这个对象应当渲染的贡献，按顺序：
 * - 站点配置 `slots.hide` 里的不渲染；
 * - 声明了 `objectTypes` 的只接这些类型；声明了 `capability` 的只在对象具备该能力（且存在、可见）时渲染；
 * - 排序：站点配置 `slots.order[target]` 里列出的按列出顺序在前，其余按 `order`（缺省 100）再按 id。
 */
export function selectSlotContributions(
  target: string,
  contributions: readonly SlotContribution[],
  context: { summary?: ObjectSummary | null; objectType?: string },
  config: SlotSiteConfig = {},
): SlotContribution[] {
  const hidden = new Set(config.hide ?? []);
  const explicit = config.order?.[target] ?? [];
  const rank = (c: SlotContribution) => {
    const i = explicit.indexOf(c.id);
    return i >= 0 ? i : explicit.length;
  };
  const objectType = context.objectType ?? context.summary?.ref.type;
  return contributions
    .filter((c) => c.target === target && !hidden.has(c.id))
    .filter((c) => !c.objectTypes?.length || (objectType !== undefined && c.objectTypes.includes(objectType)))
    .filter((c) => {
      if (!c.capability) return true;
      const s = context.summary;
      return Boolean(s && s.exists && s.visible && s.capabilities?.includes(c.capability));
    })
    .sort((a, b) => rank(a) - rank(b) || (a.order ?? 100) - (b.order ?? 100) || a.id.localeCompare(b.id));
}
