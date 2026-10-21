import * as React from "react";
import { preload } from "react-dom";
import { mediaImageAttributes, type MediaImageOptions } from "./media";

/** 每次服务端渲染一份：本次渲染是否已经用掉了唯一的 priority 名额。 */
const priorityBudget = React.cache(() => ({ used: false }));

/** 一页只有一张 LCP 图：第二张起降级为 eager（不提高优先级、不由我们预加载）。 */
export function claimPriority(): boolean {
  const budget = priorityBudget();
  if (budget.used) {
    if (process.env.NODE_ENV !== "production") console.warn("[media] more than one priority image on a page; extra ones render as eager");
    return false;
  }
  budget.used = true;
  return true;
}

/**
 * 公开页的图片（public-routes §10.4）。服务端渲染、**不带任何客户端 JS**：属性规则在 [mediaImageAttributes]，
 * 长开标签页的过期兜底由公开外框里的一段内联脚本按 `data-neton-media` 处理。
 *
 * `priority` 的图片（页面的 LCP 图：详情首图、焦点图第一张、列表第一张；一次渲染只认第一张）另外经 React 的
 * `preload` 在 `<head>` 里输出 `<link rel="preload" as="image" fetchpriority="high">`（带 imagesrcset / imagesizes），
 * 浏览器在解析到 `<img>` 之前就开始下载。
 */
export function MediaImage(props: MediaImageOptions) {
  const priority = props.priority ? claimPriority() : false;
  const attrs = mediaImageAttributes({ ...props, priority, eager: props.eager || props.priority });
  if (priority) {
    preload(attrs.src, {
      as: "image",
      fetchPriority: "high",
      ...(attrs.srcSet ? { imageSrcSet: attrs.srcSet, imageSizes: attrs.sizes } : {}),
    });
  }
  // eslint-disable-next-line @next/next/no-img-element -- 缩放由 CDN 的图片处理参数完成，不经 Next 的图片优化（CLIENT_SPEC §7）
  return <img {...attrs} />;
}
