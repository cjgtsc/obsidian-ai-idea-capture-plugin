import { requestUrl } from "obsidian";
import { BaseSTTProvider } from "../base";

/**
 * Google Gemini 特化转写适配器
 * 由于 Gemini 没有标准 Whisper Endpoint，通过对话接口进行“语义转写”
 */
export class GeminiSTTProvider extends BaseSTTProvider {
    
    async transcribe(audioArrayBuffer: ArrayBuffer): Promise<string> {
        const base64Audio = Buffer.from(audioArrayBuffer).toString('base64');
        const payload = {
            model: this.config.model,
            messages: [{
                role: "user",
                content: [
                    { type: "text", text: "请精准转录这段音频中的文字，不要返回任何多余的解释。" },
                    { type: "image_url", image_url: { url: `data:audio/mpeg;base64,${base64Audio}` } }
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
        
        return res.json.choices?.[0]?.message?.[0]?.text || res.json.choices?.[0]?.message?.content || "";
    }
}
