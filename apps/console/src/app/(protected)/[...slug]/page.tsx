/**
 * 内容由工作区宿主渲染，这里只负责让宿主认识这些路径。
 * 解析路径与渲染都在工作区里完成；鉴权在受保护布局（server component）里已做过。
 */
export default function CatchAllRoute() {
  return null;
}
