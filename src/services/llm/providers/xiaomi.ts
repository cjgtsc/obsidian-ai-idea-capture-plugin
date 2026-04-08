import { OpenAIProvider } from "./openai";
import { requestUrl } from "obsidian";
import { SessionData } from "../../../types";

/**
 * Xiaomi MiMo 服务提供商
 * 协议：OpenAI 兼容
 * 特性：强制使用 api-key Header 进行身份验证
 * 注意：mimo-v2-omni 在 max_tokens 过小时可能触发思考模式（返回 SSE 流），
 *       需要在 Payload 中禁用思考并保证 max_tokens 足够。
 */
export class XiaomiProvider extends OpenAIProvider {
    
    /**
     * 重写认证头组装 (Hooks)
     * 解决小米接口对标准 Authorization 头的敏感冲突
     */
    protected buildHeaders(): Record<string, string> {
        return {
            "Content-Type": "application/json",
            "api-key": this.config.key.trim()
        };
    }

    /**
     * 重写 Payload 组装：禁用思考模式，避免 mimo 在小请求时启动 SSE 思维链导致 JSON 解析崩溃
     */
    protected preparePayload(model: string, system: string, user: string, maxTokens: number): any {
        return {
            model: model,
            messages: [
                { role: "system", content: system },
                { role: "user", content: user }
            ],
            // mimo-v2-omni 的思考模式会在 max_tokens 较小时切换为流式输出，必须关闭
            enable_thinking: false,
            max_tokens: Math.max(maxTokens, 256),  // 保证至少 256 token，避免触发降级
            stream: false
        };
    }

    /**
     * 重写 compareContext：增加对 JSON 解析失败的容错（mimo 偶发不稳定响应）
     */
    async compareContext(userText: string, recentSessions: SessionData[]): Promise<string | 'NEW'> {
        try {
            if (recentSessions.length === 0) return 'NEW';
            const systemPrompt = '你是一个逻辑严密的助手。判断新输入是否为旧主题的延续。若强相关只返回 sessionId，否则返回 NEW。';
            const payload = this.preparePayload(this.config.model, systemPrompt, userText, 256);
            const res = await requestUrl({
                url: this.config.url,
                method: 'POST',
                headers: this.buildHeaders(),
                body: JSON.stringify(payload)
            });
            // 防御：若响应体无法解析为 JSON，安全降级
            let json: any;
            try { json = res.json; } catch(e) { return 'NEW'; }
            const raw = this.parseResponse(json);
            const result = raw.trim();
            return recentSessions.some(s => s.sessionId === result) ? result : 'NEW';
        } catch (e) {
            return 'NEW';
        }
    }
}
