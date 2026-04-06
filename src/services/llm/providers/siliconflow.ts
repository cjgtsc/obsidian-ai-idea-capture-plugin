import { BaseLLMProvider } from "../base";
import { SessionData } from "../../../types";
import { requestUrl } from "obsidian";

/**
 * 硅基流动 (SiliconFlow) 服务提供商
 * 协议特点：
 * 1. 深度兼容 OpenAI。
 * 2. 对 DeepSeek-R1 等推理模型支持良好，可能会返回 reasoning_content 字段。
 */
export class SiliconFlowProvider extends BaseLLMProvider {

    protected parseResponse(json: any): string {
        // 硅基流动在适配 R1 时，可能会将思考过程放在 content 内或独立字段
        // 我们通过基类的通用逻辑 + 特化处理确保 content 纯净
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
