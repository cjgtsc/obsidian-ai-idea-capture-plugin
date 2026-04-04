import { requestUrl } from "obsidian";
import { BaseVisionProvider } from "../base";

/**
 * Anthropic 视觉识别服务提供商
 * 协议特点：使用 Messages API，图片采用 source { type: 'base64', ... } 结构
 */
export class AnthropicVisionProvider extends BaseVisionProvider {

    protected buildHeaders(): Record<string, string> {
        return {
            "Content-Type": "application/json",
            "x-api-key": this.config.key,
            "anthropic-version": "2023-06-01"
        };
    }

    async understandImage(base64Data: string, prompt: string): Promise<string> {
        // 处理心跳探测
        if (base64Data === "ping") {
            return "pong";
        }

        const payload = {
            model: this.config.model,
            max_tokens: 1024,
            messages: [{
                role: "user",
                content: [
                    {
                        type: "image",
                        source: {
                            type: "base64",
                            media_type: "image/jpeg",
                            data: base64Data
                        }
                    },
                    {
                        type: "text",
                        text: prompt
                    }
                ]
            }],
            stream: false
        };
        
        const res = await requestUrl({ 
            url: this.config.url, 
            method: "POST", 
            headers: this.buildHeaders(), 
            body: JSON.stringify(payload) 
        });
        
        // Anthropic 返回格式解析
        if (res.json.content && Array.isArray(res.json.content)) {
            return res.json.content
                .filter((block: any) => block.type === 'text')
                .map((block: any) => block.text)
                .join('');
        }
        return "";
    }
}
