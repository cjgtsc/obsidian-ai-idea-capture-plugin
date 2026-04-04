import { BaseLLMProvider } from "../base";
import { SessionData } from "../../../types";
import { requestUrl } from "obsidian";

/**
 * Groq 服务提供商
 * 协议特点：
 * 1. 深度兼容 OpenAI。
 * 2. 极致的生成速度，适合作为语义上下文比对的引擎。
 */
export class GroqProvider extends BaseLLMProvider {

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
