import { requestUrl } from "obsidian";
import { BaseSearchProvider } from "../base";

/**
 * 自定义 Serper 兼容提供商 (专门服务于 GeminiLocalSearch 等本地补丁)
 * 职责：处理 Base URL 自定义映射，提供宽容的 Auth 校验
 */
export class CustomSerperProvider extends BaseSearchProvider {
    async search(query: string): Promise<string> {
        try {
            // 鲁棒性处理：确保 URL 不为空且包含正确的协议
            let targetUrl = this.config.url.trim();
            if (!targetUrl) throw new Error("Base URL is empty");
            
            // 如果用户只填了 IP 和端口，自动补全 /search 路径
            if (!targetUrl.endsWith('/search') && !targetUrl.endsWith('/')) {
                targetUrl += '/search';
            }

            const headers = this.buildHeaders('application/json');
            // 只有当提供了 Key 时才发送 Header，支持本地匿名访问
            if (this.config.key) {
                headers['X-API-KEY'] = this.config.key;
            }
            
            const res = await requestUrl({
                url: targetUrl,
                method: 'POST',
                headers: headers,
                body: JSON.stringify({ q: query, num: 5 })
            });
            
            // 兼容性解析：优先解析 Serper 的 organic 结构
            const results = res.json.organic || [];
            if (results.length === 0) return '';

            return results
                .map((r: any) => `来源: ${r.title} (${r.link || r.url})\n内容: ${r.snippet || r.content}`)
                .join('\n\n');
        } catch (e) {
            throw new Error(this.normalizeError(e));
        }
    }
}
