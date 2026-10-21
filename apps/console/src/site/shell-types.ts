import type * as React from "react";

/** 门户外壳的入参（底座 `(public)` 布局传入）。fork 覆盖 portal-shell.tsx 时保持这个签名。 */
export interface PortalShellProps {
  children: React.ReactNode;
  brand: { name: string; tagline: string };
  locale: string;
  origin: string;
  consoleBasePath: string;
}
