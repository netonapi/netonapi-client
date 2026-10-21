import { site } from "@/generated/site.generated";
import { serverI18n } from "./server-i18n";

/** 404 / 410 状态页的正文（外壳之内）。恒为 noindex（由元数据给出）。 */
export async function StatusPage({ kind }: { kind: "notFound" | "gone" }) {
  const t = await serverI18n.getServerT("site", site.locale);
  return (
    <section className="mx-auto max-w-xl py-20 text-center">
      <h1 className="text-2xl font-semibold">{t(`status.${kind}.title`)}</h1>
      <p className="mt-3 text-sm text-[var(--muted-foreground)]">{t(`status.${kind}.body`)}</p>
      <a href="/" className="mt-8 inline-flex h-10 items-center rounded-full bg-[var(--primary)] px-5 text-sm font-medium text-[var(--primary-foreground)]">{t("status.home")}</a>
    </section>
  );
}

export async function statusTitle(kind: "notFound" | "gone"): Promise<string> {
  const t = await serverI18n.getServerT("site", site.locale);
  return t(`status.${kind}.title`);
}
