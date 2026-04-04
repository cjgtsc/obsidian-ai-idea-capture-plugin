import { requestUrl } from "obsidian";
import { BaseSearchProvider } from "../base";

/**
 * Tavily 搜索提供商
 */
export class TavilyProvider extends BaseSearchProvider {
    async search(query: string): Promise<string> {
        try {
            const res = await requestUrl({
                url: this.config.url,
                method: 'POST',
                headers: this.buildHeaders('application/json'),
                body: JSON.stringify({
                    api_key: this.config.key,
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
