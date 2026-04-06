import { BaseLLMProvider } from "../base";
import { SessionData } from "../../../types";
import { requestUrl } from "obsidian";

/**
 * 阿里云通义千问 (Qwen) 服务提供商
 * 协议特点：支持 x-dashscope-session-cache 缓存以降低多轮对话成本。
 */
export class QwenProvider extends BaseLLMProvider {

    protected buildHeaders(): Record<string, string> {
        const headers = super.buildHeaders();
        // 开启百炼平台的上下文缓存 (针对多轮对话笔记场景极其有效)
        headers["x-dashscope-session-cache"] = "enable";
        return headers;
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
