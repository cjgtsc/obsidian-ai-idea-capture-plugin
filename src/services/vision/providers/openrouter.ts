import { OpenAICompatibleVisionProvider } from "./openai_compatible";
import { requestUrl } from "obsidian";

/**
 * OpenRouter 视觉识别服务提供商
 * 协议特点：深度兼容 OpenAI Vision 格式，但需要特定的应用标识 Header
 */
export class OpenRouterVisionProvider extends OpenAICompatibleVisionProvider {

    protected buildHeaders(): Record<string, string> {
        const headers = super.buildHeaders();
        // 注入 OpenRouter 推荐的应用标识
        headers["HTTP-Referer"] = "https://github.com/xiongsong/2Brain";
        headers["X-Title"] = "2Brain Obsidian Plugin";
        return headers;
    }

    async understandImage(base64Data: string, prompt: string): Promise<string> {
        // 针对 OpenRouter 的心跳探测优化
        if (base64Data === "ping") {
            return "pong";
        }
        return super.understandImage(base64Data, prompt);
    }
}
