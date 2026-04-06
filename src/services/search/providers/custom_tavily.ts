import { requestUrl } from "obsidian";
import { BaseSearchProvider } from "../base";

/**
 * 自定义 Tavily 兼容提供商 (专门服务于各种 Tavily 兼容的本地或中转 API)
 * 职责：处理 Base URL 自定义映射，提供灵活的认证支持
 */
export class CustomTavilyProvider extends BaseSearchProvider {
    async search(query: string): Promise<string> {
        try {
            // 鲁棒性处理：确保 URL 不为空
            let targetUrl = this.config.url.trim();
            if (!targetUrl) throw new Error("Base URL is empty");
            
            // 自动补全路径 (Tavily 标准路径为 /search)
            if (!targetUrl.endsWith('/search') && !targetUrl.endsWith('/')) {
                targetUrl += '/search';
            }

            const res = await requestUrl({
                url: targetUrl,
                method: 'POST',
                headers: this.buildHeaders('application/json'),
                body: JSON.stringify({
                    api_key: this.config.key, // 保持兼容性名称
                    query: query,
                    search_depth: 'basic',
                    max_results: 5
                })
            });
            
            if (!res.json.results) return '';
            return res.json.results
                .map((r: any) => `来源: ${r.title} (${r.url})\n内容: ${r.content}`)
                .join('\n\n');
        } catch (e) {
            throw new Error(this.normalizeError(e));
        }
    }
}
