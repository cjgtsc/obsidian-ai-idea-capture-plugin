import { requestUrl } from "obsidian";
import { BaseSearchProvider } from "../base";

/**
 * Google Serper 官方搜索提供商
 * 协议特点：必须发送 X-API-KEY Header，Payload 字段为 q
 */
export class SerperProvider extends BaseSearchProvider {
    async search(query: string): Promise<string> {
        try {
            const headers = this.buildHeaders('application/json');
            headers['X-API-KEY'] = this.config.key;
            
            const res = await requestUrl({
                url: this.config.url,
                method: 'POST',
                headers: headers,
                body: JSON.stringify({ q: query, num: 5 })
            });
            
            if (!res.json.organic) return '';
            return res.json.organic
                .map((r: any) => `来源: ${r.title} (${r.link})\n内容: ${r.snippet}`)
                .join('\n\n');
        } catch (e) {
            throw new Error(this.normalizeError(e));
        }
    }
}
