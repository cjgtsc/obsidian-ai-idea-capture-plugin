import { BaseLLMProvider } from "../base";
import { SessionData } from "../../../types";
import { requestUrl } from "obsidian";

/**
 * 阶跃星辰 (StepFun) 服务提供商
 * 协议特点：
 * 1. 深度兼容 OpenAI。
 * 2. 推理模型 (step-2) 可能会在 content 中包含思考过程（取决于参数）。
 */
export class StepFunProvider extends BaseLLMProvider {

    protected parseResponse(json: any): string {
        const content = json.choices?.[0]?.message?.content || "";
        // 剔除任何可能存在的思考标签，保持笔记纯净
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
