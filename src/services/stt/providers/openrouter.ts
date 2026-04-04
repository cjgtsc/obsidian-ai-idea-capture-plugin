import { requestUrl } from "obsidian";
import { BaseSTTProvider } from "../base";

/**
 * OpenRouter STT 服务提供商 (全模态 Chat 模式)
 * 协议特点：使用标准的 /chat/completions 接口，音频以 Base64 形式嵌入 JSON Payload。
 */
export class OpenRouterSTTProvider extends BaseSTTProvider {
    
    async transcribe(audioArrayBuffer: ArrayBuffer): Promise<string> {
        // 1. 将音频转换为 Base64 (OpenRouter 不支持二进制 Form 上传)
        const base64Audio = Buffer.from(audioArrayBuffer).toString('base64');
        
        // 2. 组装全模态消息
        const payload = {
            model: this.config.model,
            messages: [
                {
                    role: "user",
                    content: [
                        { type: "text", text: "Please transcribe this audio exactly." },
                        {
                            type: "input_audio",
                            input_audio: {
                                data: base64Audio,
                                format: "wav" // 多数转录模型兼容 wav 封装
                            }
                        }
                    ]
                }
            ]
        };

        const res = await requestUrl({ 
            url: this.config.url, 
            method: "POST", 
            headers: { 
                ...this.buildHeaders(),
                "HTTP-Referer": "https://github.com/xiongsong/2Brain",
                "X-Title": "2Brain Obsidian Plugin",
                "Content-Type": "application/json"
            }, 
            body: JSON.stringify(payload) 
        });
        
        // OpenRouter 响应格式与 Chat 接口一致
        return res.json.choices?.[0]?.message?.content || "";
    }
}
