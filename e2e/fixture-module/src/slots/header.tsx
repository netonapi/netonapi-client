"use client";

import { usePublicSession } from "@neton/application-client-runtime/public-client";
import type { SiteSlotProps } from "@neton/application-client-runtime/public";

/** 页头插槽（门户 `public.header.actions` 与控制台 `console.header.actions` 共用）：显示会话状态，用来验证两处都挂着会话水合。 */
export default function HeaderSlot({ locale }: SiteSlotProps) {
  const { state } = usePublicSession();
  return <span data-testid="header-slot" data-locale={locale} data-session={state.status} />;
}
