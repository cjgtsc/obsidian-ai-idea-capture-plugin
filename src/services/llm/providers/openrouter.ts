import { BaseLLMProvider } from "../base";
import { SessionData } from "../../../types";
import { requestUrl } from "obsidian";

/**
 * OpenRouter 服务提供商
 * 协议特点：
 * 1. 深度兼容 OpenAI。
 * 2. 建议包含 HTTP-Referer 和 X-Title 以增强厂商识别。
 * 3. 作为聚合平台，其响应中可能包含非标字段（如使用量统计等）。
 */
export class OpenRouterProvider extends BaseLLMProvider {

    protected buildHeaders(): Record<string, string> {
        const headers = super.buildHeaders();
        // 按照 OpenRouter 官方建议增加应用标识 (帮助排名及监控)
        headers["HTTP-Referer"] = "https://github.com/xiongsong/2Brain"; 
        headers["X-Title"] = "2Brain Obsidian Plugin";
        return headers;
    }

    protected parseResponse(json: any): string {
        // OpenRouter 可能会在 content 内部混入思考过程（取决于底层厂商）
        const content = json.choices?.[0]?.message?.content || "";
        return content.replace(/<(?:think|thought)>[\s\S]*?<\/(?:think|thought)>/gi, "").trim();
    }

    async compareContext(userText: string, recentSessions: SessionData[]): Promise<string | 'NEW'> {
        try {
            if (recentSessions.length === 0) return 'NEW';
            const systemPrompt = '你是一个逻辑严密的助手。判断新输入是否为旧主题的延续。若强相关只返回 sessionId，否则返回 NEW。';
            const payload = this.preparePayload(this.config.model, systemPrompt, userText, 50);
            const res = await requestUrl({ 
                url: this.config.url, 
                method: 'POST', 
                headers: this.buildHeaders(), 
                body: JSON.stringify(payload) 
            });
            const raw = this.parseResponse(res.json);
            const result = raw.trim();
            return recentSessions.some(s => s.sessionId === result) ? result : 'NEW';
        } catch (e) { return 'NEW'; }
    }
}
