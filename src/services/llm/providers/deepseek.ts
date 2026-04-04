import { BaseLLMProvider } from "../base";
import { SessionData } from "../../../types";
import { requestUrl } from "obsidian";

/**
 * DeepSeek 服务提供商
 * 协议特点：
 * 1. 官方 API (deepseek-reasoner) 会返回 reasoning_content 字段。
 * 2. 多轮对话必须在 history 中剔除上轮的 reasoning_content。
 */
export class DeepSeekProvider extends BaseLLMProvider {

    protected parseResponse(json: any): string {
        // 优先获取官方 R1 的 reasoning_content (如果需要的话，目前由于本项目是笔记类，只保留最终 content)
        // 但我们要确保剔除 content 里的 <think> 标签（针对第三方 API）
        const content = json.choices?.[0]?.message?.content || "";
        return content.replace(/<(?:think|thought)>[\s\S]*?<\/(?:think|thought)>/gi, "").trim();
    }

    /**
     * 重写 payload 组装，确保模型参数的安全（如推理模型不支持 temperature）
     */
    protected preparePayload(model: string, system: string, user: string, maxTokens: number): any {
        const payload: any = {
            model: model,
            messages: [
                { role: "system", content: system },
                { role: "user", content: user }
            ],
            max_tokens: maxTokens,
            stream: false
        };

        // 如果是推理模型，移除不支持的采样参数
        if (model.includes('reasoner') || model.includes('r1')) {
            // 基类默认没带这些，但如果未来基类加了，这里需要 delete
        }

        return payload;
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
