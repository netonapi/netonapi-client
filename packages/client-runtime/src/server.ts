/** 仅限 server 侧（RSC / Route Handler）使用。 */
import { cache } from "react";
import type { Envelope, MemberProfile } from "./types";

export const SESSION_COOKIE = "neton_client_session";

export function backendUrl(): string {
  return process.env.NETON_BACKEND_URL ?? "http://localhost:8080";
}

/**
 * 调后端 app API（envelope {code,message,data}）。
 * 网络错误 / 非 JSON 统一折叠成 code=-1，401 保留原码，调用方据 code 决策。
 */
export async function backendJson<T>(
  path: string,
  token?: string,
  init?: RequestInit,
): Promise<Envelope<T>> {
  let res: Response;
  try {
    res = await fetch(`${backendUrl()}${path}`, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(init?.headers ?? {}),
      },
      cache: "no-store",
    });
  } catch (e) {
    return { code: -1, message: `backend unreachable: ${String(e)}` };
  }
  if (res.status === 401) return { code: 401, message: "unauthorized" };
  try {
    return (await res.json()) as Envelope<T>;
  } catch {
    return { code: -1, message: `bad backend response (${res.status})` };
  }
}

/** 每请求去重：当前登录会员资料（layout 与 catch-all 各取一次只打一次后端）。 */
export const getMemberProfile = cache(async (token: string) =>
  backendJson<MemberProfile>("/app/member/user/get", token),
);
