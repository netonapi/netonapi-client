/**
 * C 端模块（device、account 等）只通过本文件访问工作区路由与导航，
 * 不直连 @neton/application-front-workspace——保持 admin / client 两条线对
 * 工作区运行时的依赖隔离，日后 client 线若换宿主只改这一处。
 */
export {
  useWorkspaceRoute,
  useWorkspaceNavigation,
  useTabTitle,
  useWorkspace,
  useWorkspaceStore,
} from "@neton/application-front-workspace";
export type { WorkspaceLocation, WorkspaceNavigation } from "@neton/application-front-workspace";
