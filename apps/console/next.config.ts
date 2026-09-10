import type { NextConfig } from "next";
import frontModules from "./client.modules";

const config: NextConfig = {
  allowedDevOrigins: ["127.0.0.1"],
  transpilePackages: [
    "@neton/application-client-contract",
    "@neton/application-front-workspace",
    "@neton/application-client-runtime",
    "@neton/application-client-kit",
    "@neton/application-client-resource",
    ...frontModules,
  ],
};

export default config;
