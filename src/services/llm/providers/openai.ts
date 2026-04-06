import { requestUrl } from "obsidian";
import { BaseLLMProvider } from "../base";
import { SessionData } from "../../../types";

/**
 * OpenAI 标准服务提供商
 * 适用于：OpenAI, DeepSeek, Groq, Kimi, Qwen, Ollama, SiliconFlow 等所有兼容厂商
 */
export class OpenAIProvider extends BaseLLMProvider {
    
    /**
     * 语义上下文比对逻辑
     * 判定新输入是否为旧主题的延续
     */
    async compareContext(userText: string, recentSessions: SessionData[]): Promise<string | 'NEW'> {
        try {
            if (recentSessions.length === 0) return 'NEW';
            
            const systemPrompt = '你是一个逻辑严密的助手。判断新输入是否为旧主题的延续。若强相关只返回 sessionId，否则返回 NEW。';
            // 复用基类的 preparePayload 逻辑
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
        } catch (e) {
            return 'NEW'; // 失败时安全降级为开启新会话
        }
    }
}
