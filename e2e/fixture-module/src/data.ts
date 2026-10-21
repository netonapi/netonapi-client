import { feedTag, objTag, type PublicCard, type PublicMedia } from "@neton/application-client-runtime/public";
import { isPublicBackendError, type PublicBackend } from "@neton/application-client-runtime/public-server";

export const ITEM = "fixture.item";

export interface FixtureItem {
  id: string;
  title: string;
  summary: string;
  body: string;
  publishedAt: string;
  updatedAt?: string | null;
  cover?: PublicMedia | null;
  author?: string | null;
  redirectTo?: string | null;
}

export interface FixturePage { list: PublicCard[]; nextCursor?: string | null }

export function listTags(page: FixturePage): string[] {
  return [feedTag(ITEM), ...page.list.map((c) => objTag(c.ref.type, c.ref.id))];
}

export async function loadPage(backend: PublicBackend, query: { cursor?: string; sort?: string; limit?: number }): Promise<FixturePage> {
  return backend.get<FixturePage>("/app/fixture/items", query);
}

export type ItemResult = { kind: "ok"; item: FixtureItem } | { kind: "not_found" | "unavailable" | "gone" };

/** 机器码 → 状态（public-routes §7）：不存在 404、暂时下线 404 + noindex、彻底删除 gone。 */
export async function loadItem(backend: PublicBackend, id: string): Promise<ItemResult> {
  try {
    return { kind: "ok", item: await backend.get<FixtureItem>(`/app/fixture/item/${id}`) };
  } catch (error) {
    if (isPublicBackendError(error, "FIXTURE_NOT_FOUND")) return { kind: "not_found" };
    if (isPublicBackendError(error, "FIXTURE_UNAVAILABLE")) return { kind: "unavailable" };
    if (isPublicBackendError(error, "FIXTURE_GONE")) return { kind: "gone" };
    throw error;
  }
}
