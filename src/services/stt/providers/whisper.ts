import { requestUrl } from "obsidian";
import { BaseSTTProvider } from "../base";

/**
 * 标准 OpenAI Whisper 兼容适配器
 * 适用于：OpenAI, Groq, SiliconFlow, 8000端口本地服务等
 */
export class WhisperProvider extends BaseSTTProvider {
    
    async transcribe(audioArrayBuffer: ArrayBuffer): Promise<string> {
        const boundary = '----IdeaCapture' + Math.random().toString(36).substring(2);
        const enc = new TextEncoder();
        const p1 = `--${boundary}\r\nContent-Disposition: form-data; name="model"\r\n\r\n${this.config.model}\r\n--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="voice.oga"\r\nContent-Type: audio/opus\r\n\r\n`;
        const p3 = `\r\n--${boundary}--\r\n`;
        
        const body = new Uint8Array(enc.encode(p1).byteLength + audioArrayBuffer.byteLength + enc.encode(p3).byteLength);
        body.set(enc.encode(p1), 0);
        body.set(new Uint8Array(audioArrayBuffer), enc.encode(p1).byteLength);
        body.set(enc.encode(p3), enc.encode(p1).byteLength + audioArrayBuffer.byteLength);
        
        const res = await requestUrl({ 
            url: this.config.url, 
            method: "POST", 
            headers: { 
                ...this.buildHeaders(),
                "Content-Type": "multipart/form-data; boundary=" + boundary 
            }, 
            body: body.buffer 
        });
        
        return res.json.text || "";
    }
}
