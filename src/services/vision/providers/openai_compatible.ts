import { requestUrl } from "obsidian";
import { BaseVisionProvider } from "../base";

/**
 * 标准 OpenAI Vision 兼容基类适配器
 * 职责：处理标准的 messages content [text, image_url] 结构
 */
export abstract class OpenAICompatibleVisionProvider extends BaseVisionProvider {
    
    async understandImage(base64Data: string, prompt: string): Promise<string> {
        // 处理心跳探测 (Diagnostics)
        if (base64Data === "ping") {
            const payload = { 
                model: this.config.model, 
                messages: [{ role: "user", content: "ping" }], 
                stream: false 
            };
            await requestUrl({ url: this.config.url, method: "POST", headers: this.buildHeaders(), body: JSON.stringify(payload) });
            return "pong";
        }

        const payload = {
            model: this.config.model,
            messages: [{
                role: "user",
                content: [
                    { type: "text", text: prompt },
                    { type: "image_url", image_url: { url: `data:image/jpeg;base64,${base64Data}` } }
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
        
        return res.json.choices?.[0]?.message?.content || "";
    }
}
