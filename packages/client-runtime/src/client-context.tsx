"use client";

import * as React from "react";
import {
  QueryClient,
  QueryClientProvider,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";

/**
 * 会话快照。进入受保护区时取一次，之后页面切换只读这份快照，不再打后端。
 *
 * C 端没有后端菜单与 RBAC：导航是产品自己的静态 `consoleNav`，可见性由模块自身
 * 和后端 app API 鉴权保证，所以这里只有成员资料与（预留的）角色/权限位。
 */
export interface FrontClientContextValue {
  permissions: string[];
  roles: string[];
  user: SessionUser;
}

export interface SessionUser {
  userId: string;
  username: string;
  nickname: string;
  avatar: string;
  homePath: string;
}

const FrontClientContext = React.createContext<FrontClientContextValue | null>(null);

function permissionMatches(granted: string, expected: string): boolean {
  if (granted === "*" || granted === "*:*:*" || granted === expected) return true;
  const grantedParts = granted.split(":");
  const expectedParts = expected.split(":");
  return grantedParts.length === expectedParts.length
    && grantedParts.every((part, index) => part === "*" || part === expectedParts[index]);
}

export function FrontClientProvider({
  children,
  permissions,
  roles,
  user,
}: FrontClientContextValue & { children: React.ReactNode }) {
  const [queryClient] = React.useState(() => new QueryClient({
    defaultOptions: {
      queries: {
        refetchOnWindowFocus: false,
        retry: 1,
        staleTime: 15_000,
      },
    },
  }));

  const contextValue = React.useMemo(() => ({ permissions, roles, user }), [permissions, roles, user]);

  return (
    <QueryClientProvider client={queryClient}>
      <FrontClientContext.Provider value={contextValue}>
        {children}
      </FrontClientContext.Provider>
    </QueryClientProvider>
  );
}

export function useFrontClient(): FrontClientContextValue {
  const value = React.useContext(FrontClientContext);
  if (!value) throw new Error("useFrontClient must be used inside FrontClientProvider");
  return value;
}

/** 会话快照。页面直接读，不要自己再去拉。 */
export function useSession(): FrontClientContextValue {
  return useFrontClient();
}

export function usePermission(permission?: string): boolean {
  const { permissions } = useFrontClient();
  if (!permission) return true;
  return permissions.some((granted) => permissionMatches(granted, permission));
}

export { useMutation, useQuery, useQueryClient };
