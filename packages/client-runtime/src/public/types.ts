/** 与后端契约库 contract.core 对齐的对象引用与摘要（只读展示用，不能代替授权检查）。 */

export interface ObjectRef {
  type: string;
  id: string;
}

export interface ObjectLink {
  app?: string | null;
  web?: string | null;
}

export interface ObjectSummary {
  ref: ObjectRef;
  exists: boolean;
  visible: boolean;
  title?: string;
  summary?: string | null;
  /** MediaRef（fileId），不是地址；地址由 infra 的媒体地址策略给出 */
  cover?: { fileId: string } | null;
  link?: ObjectLink;
  capabilities?: string[];
  /** 对外计数（拥有对象的模块在详情里给出，缓存时效内允许滞后；没有的计数省略） */
  commentCount?: number;
  favoriteCount?: number;
  viewCount?: number;
}

/** 筛选器卡片流（filter-module §6.7 `Card`）：对象引用 + 摘要 + 拥有模块给的列表视图（各模块自定形状）。 */
export interface PublicCard {
  ref: ObjectRef;
  summary?: ObjectSummary | null;
  view?: unknown;
}

export function objectRefKey(ref: ObjectRef): string {
  return `${ref.type}:${ref.id}`;
}
