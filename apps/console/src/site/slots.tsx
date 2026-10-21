import * as React from "react";
import { selectSlotContributions, type ClientSlotProps, type ObjectRef, type ObjectSummary, type PublicSeoContext, type ServerSlotProps } from "@neton/application-client-runtime/public";
import { slotRegistry } from "@/generated/public.generated";
import { site } from "@/generated/site.generated";
import { ClientSlotBoundary } from "./slot-boundary";

/**
 * 插槽分发（public-routes §10.2）：对象插槽只认 ObjectRef；按 capability / objectTypes 过滤，
 * 站点配置 `slots.order` / `slots.hide` 可覆盖顺序与隐藏。一个贡献失败只影响它自己，不让整页 500。
 */
export function renderSlot(target: string, props: { objectRef: ObjectRef; summary: ObjectSummary }, ctx: PublicSeoContext) {
  const selected = selectSlotContributions(target, slotRegistry.map((s) => s.contribution), { summary: props.summary, objectType: props.objectRef.type }, site.slots);
  if (!selected.length) return null;
  return selected.map((contribution) => {
    const entry = slotRegistry.find((s) => s.contribution === contribution)!;
    const slotProps: ClientSlotProps = { objectRef: props.objectRef, summary: props.summary, locale: ctx.locale };
    const serverProps: ServerSlotProps = { ...slotProps, site: ctx.site, href: ctx.href };
    return contribution.rendering === "server"
      ? <ServerSlot key={contribution.id} id={contribution.id} Component={entry.Component} props={serverProps} />
      : <ClientSlotBoundary key={contribution.id} id={contribution.id}><entry.Component {...slotProps} /></ClientSlotBoundary>;
  });
}

/** 服务端贡献：直接调用组件函数，抛错时记日志、渲染为空（自己有自己的缓存单元与标签）。 */
async function ServerSlot({ id, Component, props }: { id: string; Component: React.ComponentType<any>; props: ServerSlotProps }) {
  try {
    return await (Component as (p: ServerSlotProps) => React.ReactNode | Promise<React.ReactNode>)(props);
  } catch (error) {
    console.error(`[site] slot ${id} failed: ${error instanceof Error ? error.message : String(error)}`);
    return null;
  }
}
