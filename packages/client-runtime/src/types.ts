/** 与 module-system AuthController / MenuVO 对齐的最小类型集。 */

export interface Envelope<T> {
  code: number;
  /** 失败时是机器码（spec ERROR_CODE_SPEC「消息即机器码」），界面经 useDescribeError 翻译，不直接显示。 */
  message?: string;
  data?: T;
  /** 字段级错误（见 client.ts 的 ApiFieldError）。 */
  errors?: { field?: string; message: string; code?: string; params?: Record<string, number> }[];
}

export interface LoginResponse {
  accessToken: string;
  refreshToken: string;
  userId: number;
  expiresTime: number;
  username: string;
  nickname: string;
}

export interface MenuNode {
  id: number;
  name: string;
  permission?: string | null;
  /** 1=目录 2=菜单 3=按钮 */
  type: number;
  parentId: number;
  path?: string | null;
  /** 页面 key（== FrontPageManifest.key） */
  component?: string | null;
  icon?: string | null;
  sort: number;
  status: number;
  visible: boolean;
  keepAlive: boolean;
  children?: MenuNode[] | null;
}

export interface PermissionInfo {
  user: {
    userId: string;
    username: string;
    nickname: string;
    avatar: string;
    homePath: string;
  };
  roles: string[];
  permissions: string[];
  menus: MenuNode[];
}

export interface PageResponse<T> {
  list: T[];
  total: number;
  page: number;
  size: number;
  totalPages: number;
}

/**
 * 当前格式化语言与时区。由 I18nProvider 在语言切换时设置（见 i18n.tsx 的 setFormatLocale），
 * 使模块里直接调用的 [formatDateTime] 不必改成 hook 也能跟随当前语言。
 */
let formatLocale = "zh-CN";
let formatTimeZone: string | undefined;

export function setFormatLocale(locale: string, timeZone?: string): void {
  formatLocale = locale;
  formatTimeZone = timeZone;
}

export function formatDateTime(value?: number | string | null): string {
  if (value === null || value === undefined || value === "" || value === 0 || value === "0") return "-";
  const numeric = typeof value === "string" && /^\d+$/.test(value) ? Number(value) : value;
  const milliseconds = typeof numeric === "number" && numeric < 10_000_000_000 ? numeric * 1000 : numeric;
  const date = new Date(milliseconds);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat(formatLocale, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: formatTimeZone,
  }).format(date);
}

/** 与 module-member /app/auth/login-username 响应对齐（unified token）。 */
export interface MemberLoginResponse {
  userId: number;
  accessToken: string;
  refreshToken: string;
  tokenType: string;
  expiresIn: number;
  refreshExpiresIn: number;
  scope: string[];
}

/** 与 module-member /app/member/user/get 对齐（宽松：以后端为准）。 */
export interface MemberProfile {
  id: number;
  username?: string | null;
  nickname?: string | null;
  avatar?: string | null;
  mobile?: string | null;
  [key: string]: unknown;
}

/**
 * E.164 区号（含 +）。号码本身不带分隔，单靠正则分不出区号与号码 ——
 * `^\+\d{1,3}` 会把 +8613… 切成 +861 / 3…，所以按已知区号做最长前缀匹配。
 */
export const CALLING_CODES = ["+1", "+7", "+20", "+33", "+44", "+49", "+60", "+61", "+62", "+63", "+65", "+66", "+81", "+82", "+84", "+86", "+91", "+852", "+853", "+886", "+971"];

/** +8613812345678 → +86 138****5678；认不出区号时整串打码中间段。 */
export function maskMobile(mobile: string): string {
  const cc = CALLING_CODES.filter((c) => mobile.startsWith(c)).sort((a, b) => b.length - a.length)[0] ?? "";
  const rest = mobile.slice(cc.length);
  if (rest.length < 7) return mobile;
  return `${cc ? `${cc} ` : ""}${rest.slice(0, 3)}****${rest.slice(-4)}`;
}

/** alice@example.com → al***@example.com */
export function maskEmail(email: string): string {
  const at = email.indexOf("@");
  if (at <= 0) return email;
  return `${email.slice(0, Math.min(2, at))}***${email.slice(at)}`;
}

/** 展示名：昵称 → 用户名 → 打码手机号 → 用户#id。短信注册的账号前两项都是空串，不是 null。 */
export function memberDisplayName(m: { id: number; nickname?: string | null; username?: string | null; mobile?: string | null }): string {
  return m.nickname || m.username || (m.mobile ? maskMobile(m.mobile) : "") || `用户${m.id}`;
}

/** 头像字：昵称 / 用户名里的第一个字母或汉字。都没有返回空串，由调用方换成图标 —— 别拿打码手机号的「+」充数。 */
export function memberInitial(m: { nickname?: string | null; username?: string | null }): string {
  const ch = `${m.nickname ?? ""}${m.username ?? ""}`.match(/\p{L}/u)?.[0] ?? "";
  return ch.toUpperCase();
}
