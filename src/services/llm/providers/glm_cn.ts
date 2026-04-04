import { BaseLLMProvider } from "../base";
import { SessionData } from "../../../types";
import { requestUrl } from "obsidian";

/**
 * 智谱 AI (GLM) 中国版服务提供商
 * 域名：open.bigmodel.cn
 * 职责：处理国内站特定的 /api/paas/v4 路径及国内生态适配需求。
 */
export class GLMCNProvider extends BaseLLMProvider {

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
