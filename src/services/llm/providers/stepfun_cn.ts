import { BaseLLMProvider } from "../base";
import { SessionData } from "../../../types";
import { requestUrl } from "obsidian";

/**
 * 阶跃星辰 (StepFun) 中国版服务提供商
 * 域名：api.stepfun.com
 * 职责：处理国内站特定的 reasoning 字段及采样逻辑。
 */
export class StepFunCNProvider extends BaseLLMProvider {

    protected parseResponse(json: any): string {
        // 国内版倾向于使用 reasoning 字段
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
