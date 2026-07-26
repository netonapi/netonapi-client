/* 自动生成：pnpm registry（scripts/generate-registry.mts）。禁止手改。 */
import type { FrontModuleManifest } from "@neton/application-client-contract";
import type * as React from "react";

export const installedModules: FrontModuleManifest[] = [
  {
    "id": "member",
    "contractVersion": "1.0.0",
    "pages": [
      {
        "key": "member/profile/index",
        "path": "/member/profile",
        "entry": "profile",
        "rendering": "client"
      }
    ]
  },
  {
    "id": "payment",
    "contractVersion": "1.0.0",
    "pages": [
      {
        "key": "payment/billing/index",
        "path": "/payment/billing",
        "entry": "billing",
        "rendering": "client"
      }
    ]
  },
  {
    "id": "gateway",
    "contractVersion": "1.0.0",
    "pages": [
      {
        "key": "gateway/key/index",
        "path": "/gateway/key",
        "entry": "my-keys",
        "rendering": "client"
      },
      {
        "key": "gateway/usage/index",
        "path": "/gateway/usage",
        "entry": "my-usage",
        "rendering": "client"
      },
      {
        "key": "gateway/model/index",
        "path": "/gateway/model",
        "entry": "model-catalog",
        "rendering": "client"
      }
    ]
  }
];

export const pageRegistry: Record<string, () => Promise<{ default: React.ComponentType }>> = {
  "member/profile/index": () => import("@neton/application-client-member/pages/profile"),
  "payment/billing/index": () => import("@neton/application-client-payment/pages/billing"),
  "gateway/key/index": () => import("@neton/application-client-gateway/pages/my-keys"),
  "gateway/usage/index": () => import("@neton/application-client-gateway/pages/my-usage"),
  "gateway/model/index": () => import("@neton/application-client-gateway/pages/model-catalog"),
};
