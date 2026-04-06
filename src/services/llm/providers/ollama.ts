import { BaseLLMProvider } from "../base";
import { SessionData } from "../../../types";
import { requestUrl } from "obsidian";

/**
 * Ollama (Local) 服务提供商
 * 协议特点：
 * 1. 本地运行，通常不需要 API Key。
 * 2. 高度兼容 OpenAI /v1/chat/completions。
 */
export class OllamaProvider extends BaseLLMProvider {

    /**
     * 重写测试连接逻辑
     * 对于本地服务，我们可以通过更轻量的方式判定其是否在线
     */
    async testConnection(): Promise<{ success: boolean; message: string }> {
        try {
            // Ollama 根路径通常会返回 "Ollama is running"
            const url = this.config.url.replace('/v1/chat/completions', '');
            const res = await requestUrl({ url: url || 'http://localhost:11434', method: 'GET' });
            if (res.status === 200) {
                return { success: true, message: "Ollama 服务在线！" };
            }
            return { success: false, message: `服务异常 (Status: ${res.status})` };
        } catch (e) {
            return { success: false, message: "无法连接到 Ollama，请确保服务已启动且 Base URL 正确。" };
        }
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
