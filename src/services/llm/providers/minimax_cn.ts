import { BaseLLMProvider } from "../base";
import { SessionData } from "../../../types";
import { requestUrl } from "obsidian";

/**
 * MiniMax 中国区服务提供商 (Anthropic 兼容格式)
 * 域名：api.minimaxi.com
 */
export class MiniMaxCNProvider extends BaseLLMProvider {

    protected preparePayload(model: string, system: string, user: string, maxTokens: number): any {
        return {
            model: model,
            system: system,
            messages: [{ role: "user", content: user }],
            max_tokens: maxTokens,
            stream: false,
            // 开启逻辑拆分：将思考过程从 content 中剥离，确保获取到纯净的最终答案
            reasoning_split: true
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
            const res = await requestUrl({ url: this.config.url, method: 'POST', headers: this.buildHeaders(), body: JSON.stringify(payload) });
            const raw = this.parseResponse(res.json);
            const result = raw.trim();
            return recentSessions.some(s => s.sessionId === result) ? result : 'NEW';
        } catch (e) { return 'NEW'; }
    }
}
