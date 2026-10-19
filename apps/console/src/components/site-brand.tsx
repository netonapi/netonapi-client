"use client";

import * as React from "react";
import { NO_CAPTCHA } from "@neton/application-client-runtime/captcha";
import type { SiteBrand } from "@/lib/site-brand";

export type { SiteBrand };

const SiteBrandContext = React.createContext<SiteBrand>({ name: "Neton", tagline: "", captcha: NO_CAPTCHA });

export function SiteBrandProvider({ brand, children }: { brand: SiteBrand; children: React.ReactNode }) {
  return <SiteBrandContext.Provider value={brand}>{children}</SiteBrandContext.Provider>;
}

export function useSiteBrand(): SiteBrand {
  return React.useContext(SiteBrandContext);
}
