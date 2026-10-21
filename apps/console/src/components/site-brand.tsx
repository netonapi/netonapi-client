"use client";

import * as React from "react";
import type { SiteBrand } from "@/lib/site-brand";

export type { SiteBrand };

const SiteBrandContext = React.createContext<SiteBrand | null>(null);

export function SiteBrandProvider({ brand, children }: { brand: SiteBrand; children: React.ReactNode }) {
  return <SiteBrandContext.Provider value={brand}>{children}</SiteBrandContext.Provider>;
}

export function useSiteBrand(): SiteBrand {
  const brand = React.useContext(SiteBrandContext);
  if (!brand) throw new Error("SiteBrandProvider is missing: the console and auth layouts provide the site brand.");
  return brand;
}
