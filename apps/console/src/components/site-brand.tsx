"use client";

import * as React from "react";

export type SiteBrand = { name: string; tagline: string };

const SiteBrandContext = React.createContext<SiteBrand>({ name: "Neton", tagline: "" });

export function SiteBrandProvider({ brand, children }: { brand: SiteBrand; children: React.ReactNode }) {
  return <SiteBrandContext.Provider value={brand}>{children}</SiteBrandContext.Provider>;
}

export function useSiteBrand(): SiteBrand {
  return React.useContext(SiteBrandContext);
}
