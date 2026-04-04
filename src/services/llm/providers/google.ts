import { BaseLLMProvider } from "../base";
import { SessionData } from "../../../types";
import { requestUrl } from "obsidian";

/**
 * Google Gemini 服务提供商 (支持 OpenAI 兼容模式)
 * 虽然目前使用 openai-chat 协议，但独立脚本可用于未来扩展原生多模态能力
 */
export class GoogleProvider extends BaseLLMProvider {

    /**
     * 重写 chat 方法以处理可能的 URL 参数鉴权 (如果未来需要)
     * 目前保持与基类一致，但作为特化脚本存在以备扩展
     */
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
