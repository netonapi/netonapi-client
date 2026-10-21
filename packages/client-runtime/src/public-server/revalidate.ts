/**
 * 失效端点 `POST /api/site/revalidate` 的请求校验与幂等（public-routes §8.4）。
 * 路由处理器（底座 app）只做 HTTP 与 Next API 调用，规则全在这里，可单测。
 */
import { isContractTag } from "../public/tags";

export const MAX_REVALIDATE_TAGS = 500;
export const MAX_REVALIDATE_PATHS = 500;
export const EVENT_ID_MEMORY = 10_000;

export type RevalidateMode = "refresh" | "expire";

export interface RevalidateRequest {
  eventId: string;
  items: { tag: string; mode: RevalidateMode }[];
  gone: string[];
  revived: string[];
}

export interface RevalidateFieldError { field: string; code: string }

export type RevalidateParse =
  | { ok: true; request: RevalidateRequest }
  | { ok: false; status: 400; message: "REVALIDATE_INVALID" | "REVALIDATE_TOO_LARGE"; errors: RevalidateFieldError[] };

const EVENT_ID = /^[A-Za-z0-9._:-]{1,128}$/;
const PATH = /^\/[^?#\s]*$/;

/** 保留前缀之外、形如站内路径的地址才能进已删除集合。 */
export function validGonePath(path: unknown, reserved: readonly string[]): path is string {
  if (typeof path !== "string" || path.length > 2048 || !PATH.test(path) || path.includes("//")) return false;
  return !reserved.some((prefix) => path === prefix || path.startsWith(prefix.endsWith("/") ? prefix : `${prefix}/`));
}

export function parseRevalidateRequest(raw: string, reserved: readonly string[]): RevalidateParse {
  let body: unknown;
  try { body = JSON.parse(raw); } catch {
    return { ok: false, status: 400, message: "REVALIDATE_INVALID", errors: [{ field: "body", code: "INVALID_JSON" }] };
  }
  const errors: RevalidateFieldError[] = [];
  const input = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
  const eventId = input.eventId;
  if (typeof eventId !== "string" || !EVENT_ID.test(eventId)) errors.push({ field: "eventId", code: "INVALID_EVENT_ID" });
  const itemsRaw = input.items ?? [];
  const goneRaw = input.gone ?? [];
  const revivedRaw = input.revived ?? [];
  if (!Array.isArray(itemsRaw)) errors.push({ field: "items", code: "INVALID_ITEMS" });
  if (!Array.isArray(goneRaw)) errors.push({ field: "gone", code: "INVALID_PATHS" });
  if (!Array.isArray(revivedRaw)) errors.push({ field: "revived", code: "INVALID_PATHS" });
  if (errors.length) return { ok: false, status: 400, message: "REVALIDATE_INVALID", errors };
  const itemsArr = itemsRaw as unknown[];
  const goneArr = goneRaw as unknown[];
  const revivedArr = revivedRaw as unknown[];
  if (itemsArr.length > MAX_REVALIDATE_TAGS || goneArr.length + revivedArr.length > MAX_REVALIDATE_PATHS) {
    return { ok: false, status: 400, message: "REVALIDATE_TOO_LARGE", errors: [] };
  }
  const items: RevalidateRequest["items"] = [];
  itemsArr.forEach((item, i) => {
    const it = (item && typeof item === "object" ? item : {}) as Record<string, unknown>;
    if (typeof it.tag !== "string" || !isContractTag(it.tag)) errors.push({ field: `items[${i}].tag`, code: "INVALID_TAG" });
    else if (it.mode !== "refresh" && it.mode !== "expire") errors.push({ field: `items[${i}].mode`, code: "INVALID_MODE" });
    else items.push({ tag: it.tag, mode: it.mode });
  });
  goneArr.forEach((p, i) => { if (!validGonePath(p, reserved)) errors.push({ field: `gone[${i}]`, code: "INVALID_PATH" }); });
  revivedArr.forEach((p, i) => { if (!validGonePath(p, reserved)) errors.push({ field: `revived[${i}]`, code: "INVALID_PATH" }); });
  if (errors.length) return { ok: false, status: 400, message: "REVALIDATE_INVALID", errors };
  // 同一个标签既 refresh 又 expire 时 expire 胜出（下线不能被上线盖掉）
  const merged = new Map<string, RevalidateMode>();
  for (const item of items) if (merged.get(item.tag) !== "expire") merged.set(item.tag, item.mode);
  return {
    ok: true,
    request: {
      eventId: eventId as string,
      items: [...merged].map(([tag, mode]) => ({ tag, mode })),
      gone: [...new Set(goneArr as string[])],
      revived: [...new Set(revivedArr as string[])],
    },
  };
}

/** 最近处理过的事件 ID（按插入顺序淘汰）；挂在 globalThis，与已删除集合同理。 */
export class RecentEvents {
  private readonly ids = new Set<string>();
  constructor(private readonly capacity = EVENT_ID_MEMORY) {}
  /** 第一次见到返回 true 并记下；重复返回 false。 */
  remember(id: string): boolean {
    if (this.ids.has(id)) return false;
    this.ids.add(id);
    if (this.ids.size > this.capacity) this.ids.delete(this.ids.values().next().value as string);
    return true;
  }
}

const EVENTS = Symbol.for("neton.client.site.recent-events");
export function recentEvents(): RecentEvents {
  const holder = globalThis as { [EVENTS]?: RecentEvents };
  return (holder[EVENTS] ??= new RecentEvents());
}
