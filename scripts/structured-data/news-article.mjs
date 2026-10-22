/**
 * Google 的 Article / NewsArticle 结构化数据要求（https://developers.google.com/search/docs/appearance/structured-data/article）
 * 作为 @adobe/structured-data-validator 的类型处理器——该库内置了 BreadcrumbList、Organization、Person 等，没有 Article。
 *
 * Google 把这些属性列为「推荐」（没有它们也能被收录，但进不了文章富媒体结果）；门户的门禁按「必须」执行：
 * headline、image（绝对地址）、datePublished（带时区的 ISO 8601）、author（每个都有 name）；
 * dateModified 缺失或早于 datePublished、author 没有 url 记为警告。
 */
import BaseValidator from "@adobe/structured-data-validator/src/types/base.js";

const ISO_WITH_ZONE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/;
const absolute = (u) => typeof u === "string" && /^https?:\/\/[^\s/]+/.test(u);
const list = (v) => (v === undefined || v === null ? [] : Array.isArray(v) ? v : [v]);

export default class NewsArticleValidator extends BaseValidator {
  getConditions() {
    return [this.headline, this.image, this.dates, this.author].map((c) => c.bind(this));
  }

  issue(message, severity, fieldNames) {
    return { issueMessage: message, severity, path: this.path, fieldNames };
  }

  headline(data) {
    if (typeof data.headline !== "string" || !data.headline.trim()) return this.issue('Required attribute "headline" is missing', "ERROR", ["headline"]);
    return null;
  }

  image(data) {
    const images = list(data.image).map((i) => (typeof i === "string" ? i : i && i.url));
    if (!images.length) return this.issue('Required attribute "image" is missing', "ERROR", ["image"]);
    if (!images.every(absolute)) return this.issue('Every "image" must be an absolute URL', "ERROR", ["image"]);
    return null;
  }

  dates(data) {
    if (!ISO_WITH_ZONE.test(String(data.datePublished ?? ""))) return this.issue('"datePublished" must be ISO 8601 with a time zone', "ERROR", ["datePublished"]);
    if (data.dateModified === undefined) return this.issue('Missing recommended attribute "dateModified"', "WARNING", ["dateModified"]);
    if (!ISO_WITH_ZONE.test(String(data.dateModified))) return this.issue('"dateModified" must be ISO 8601 with a time zone', "ERROR", ["dateModified"]);
    if (Date.parse(data.dateModified) < Date.parse(data.datePublished)) return this.issue('"dateModified" is earlier than "datePublished"', "WARNING", ["dateModified"]);
    return null;
  }

  author(data) {
    const authors = list(data.author);
    if (!authors.length) return this.issue('Required attribute "author" is missing', "ERROR", ["author"]);
    for (const a of authors) {
      if (!a || typeof a !== "object" || (a["@type"] !== "Person" && a["@type"] !== "Organization")) return this.issue('"author" must be a Person or an Organization', "ERROR", ["author"]);
      if (typeof a.name !== "string" || !a.name.trim()) return this.issue('Every "author" needs a "name"', "ERROR", ["author.name"]);
    }
    if (authors.some((a) => a.url !== undefined && !absolute(a.url))) return this.issue('"author.url" must be an absolute URL', "ERROR", ["author.url"]);
    return null;
  }
}
