import { BaseLLMProvider } from "../base";
import { SessionData } from "../../../types";
import { requestUrl } from "obsidian";

/**
 * Anthropic 官方服务提供商
 * 协议特点：使用 x-api-key 认证，支持 anthropic-version，Payload 使用 system 字段平级
 */
export class AnthropicProvider extends BaseLLMProvider {

    protected buildHeaders(): Record<string, string> {
        return {
            "Content-Type": "application/json",
            "x-api-key": this.config.key,
            "anthropic-version": "2023-06-01" // 默认使用旗舰版协议版本
        };
    }

    protected preparePayload(model: string, system: string, user: string, maxTokens: number): any {
        return {
            model: model,
            system: system,
            messages: [{ role: "user", content: user }],
            max_tokens: maxTokens,
            stream: false
        };
    }

    protected parseResponse(json: any): string {
        try {
            if (json.content && Array.isArray(json.content)) {
                return json.content
                    .filter((block: any) => block.type === 'text')
                    .map((block: any) => block.text)
                    .join('');
            }
            return json.choices?.[0]?.message?.content || "";
        } catch (e) { return ""; }
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
