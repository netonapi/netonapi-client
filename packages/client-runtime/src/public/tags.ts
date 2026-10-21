/**
 * 缓存标签命名（public-routes §8.3）：前端打标签、服务端 site 模块按同一套名字投递失效，是契约。
 *
 * | 标签 | 含义 |
 * | `obj:{type}:{id}` | 某对象的公开表示（详情、列表里的卡片、评论区里的每条评论） |
 * | `feed:{type}` | 含该类型对象的全部列表 |
 * | `node:{nodeType}:{nodeId}` | 列表节点自身（栏目、标签、频道、楼层、合集） |
 * | `thread:{type}:{id}` | 某对象的评论区第一页 |
 * | `site:nav` / `site:config` | 全站导航 / 站点级配置 |
 */

/** Next 对标签的硬上限：超出的标签不会被记录，失效它也没有任何效果。 */
export const MAX_TAG_LENGTH = 256;

const PART = /^[A-Za-z0-9._~-]+$/;

function part(value: string | number, what: string): string {
  const text = String(value);
  if (!PART.test(text)) throw new Error(`[tags] invalid ${what}: ${JSON.stringify(text)}`);
  return text;
}

export const SITE_NAV_TAG = "site:nav";
export const SITE_CONFIG_TAG = "site:config";

export function objTag(type: string, id: string | number): string {
  return `obj:${part(type, "object type")}:${part(id, "object id")}`;
}

export function feedTag(type: string): string {
  return `feed:${part(type, "object type")}`;
}

export function nodeTag(nodeType: string, nodeId: string | number): string {
  return `node:${part(nodeType, "node type")}:${part(nodeId, "node id")}`;
}

export function threadTag(type: string, id: string | number): string {
  return `thread:${part(type, "object type")}:${part(id, "object id")}`;
}

const TAG = /^(obj:[A-Za-z0-9._~-]+:[A-Za-z0-9._~-]+|feed:[A-Za-z0-9._~-]+|node:[A-Za-z0-9._~-]+:[A-Za-z0-9._~-]+|thread:[A-Za-z0-9._~-]+:[A-Za-z0-9._~-]+|site:nav|site:config)$/;

/** 是否一个合法的契约标签（失效端点用它拒绝乱写的标签）。 */
export function isContractTag(tag: string): boolean {
  return tag.length <= MAX_TAG_LENGTH && TAG.test(tag);
}

/** 去重、丢掉超长的；保持首次出现的顺序。 */
export function normalizeTags(tags: readonly string[]): string[] {
  return [...new Set(tags)].filter((t) => t.length <= MAX_TAG_LENGTH);
}
