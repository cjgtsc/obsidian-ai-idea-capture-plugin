import { requestUrl } from "obsidian";
import { BaseSTTProvider } from "../base";

/**
 * Xiaomi MiMo 专用转写适配器
 * 实现：通过 v1/chat/completions 接口发送音频 Base64 进行全模态理解
 */
export class XiaomiSTTProvider extends BaseSTTProvider {
    
    protected buildHeaders(): Record<string, string> {
        return {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${this.config.key.trim()}`
        };
    }

    async testConnection(): Promise<{ success: boolean; message: string }> {
        // 全模态测试策略：发送纯文本请求以避开小米对非标准音频流的 400 校验逻辑
        const testPayload = {
            model: this.config.model,
            messages: [{ role: "user", content: "ping" }],
            max_tokens: 1
        };
        try {
            await requestUrl({ 
                url: this.config.url, 
                method: "POST", 
                headers: this.buildHeaders(), 
                body: JSON.stringify(testPayload) 
            });
            return { success: true, message: "小米 MiMo 服务连通正常！" };
        } catch (e) {
            return { success: false, message: this.normalizeError(e) };
        }
    }

    async transcribe(audioArrayBuffer: ArrayBuffer): Promise<string> {
        // 1. 强制纯净 Base64 (不含 Data URI 前缀)
        const base64Audio = Buffer.from(new Uint8Array(audioArrayBuffer)).toString('base64').replace(/\r?\n|\r/g, "");
        
        const payload = {
            model: this.config.model,
            messages: [{
                role: "user",
                content: [
                    { type: "text", text: "请精准转录这段音频中的文字。" },
                    { 
                        type: "input_audio", 
                        input_audio: { 
                            data: base64Audio,
                            format: "mp3" 
                        } 
                    }
                ]
            }],
            stream: false
        };

        // 调试日志：输出发送给小米的 Payload 到控制台 (Ctrl+Shift+I 查看)
        console.log(`[Xiaomi STT Debug] URL: ${this.config.url}`);
        console.log(`[Xiaomi STT Debug] Payload:`, payload);
        
        try {
            const res = await requestUrl({ 
                url: this.config.url, 
                method: "POST", 
                headers: this.buildHeaders(), 
                body: JSON.stringify(payload) 
            });
            
            const msg = res.json.choices?.[0]?.message;
            if (!msg) return JSON.stringify(res.json);
            if (typeof msg.content === 'string') return msg.content.trim();
            if (Array.isArray(msg.content)) {
                return msg.content.filter((c: any) => c.type === 'text').map((c: any) => c.text).join('').trim();
            }
            return JSON.stringify(msg);
        } catch (e) {
            // 深度解析 Obsidian requestUrl 报错详情
            let detail = e.message;
            if (e.json) detail = JSON.stringify(e.json);
            else if (e.text) detail = e.text;
            
            console.error(`[Xiaomi STT Error] Details:`, e);
            throw new Error(`[${this.label}] STT 异常 (Code: ${e.status || 400}): ${detail}`);
        }
    }
}
