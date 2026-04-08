import { requestUrl } from "obsidian";
import { BaseSTTProvider } from "../base";

/**
 * 通用全模态 STT 适配器 (OmniChatSTTProvider)
 * 适用场景：LLM 服务商是多模态 Chat 模型（如 oMLX/gemma4、vLLM、自定义 OpenAI 兼容端点），
 *           该类模型不支持标准的 /v1/audio/transcriptions Whisper 协议，
 *           但支持通过 /v1/chat/completions + audio_url 进行全模态语音理解。
 *
 * 三级回退策略：
 *   1. audio_url（vLLM / OpenAI 兼容标准）
 *   2. 自动推导的 Whisper 端点（oMLX 等提供独立 /v1/audio/transcriptions 的服务）
 *   3. input_audio（OpenAI 原生格式）
 */
export class OmniChatSTTProvider extends BaseSTTProvider {

    /**
     * 从音频文件头字节检测 MIME 类型
     */
    private detectAudioMime(buffer: ArrayBuffer): string {
        const h = new Uint8Array(buffer.slice(0, 4));
        if (h[0] === 0x4F && h[1] === 0x67 && h[2] === 0x67 && h[3] === 0x53) return 'audio/ogg';
        if (h[0] === 0x52 && h[1] === 0x49 && h[2] === 0x46 && h[3] === 0x46) return 'audio/wav';
        if (h[0] === 0xFF && (h[1] & 0xE0) === 0xE0) return 'audio/mpeg';
        if (h[0] === 0x49 && h[1] === 0x44 && h[2] === 0x33) return 'audio/mpeg';
        return 'audio/ogg';
    }

    /**
     * 从 MIME 类型推断 input_audio 的 format 参数
     */
    private mimeToFormat(mime: string): string {
        if (mime.includes('ogg') || mime.includes('opus')) return 'ogg';
        if (mime.includes('wav')) return 'wav';
        if (mime.includes('mpeg') || mime.includes('mp3')) return 'mp3';
        return 'ogg';
    }

    /**
     * 从 MIME 类型推断上传文件名（供 multipart 表单使用）
     */
    private mimeToFilename(mime: string): string {
        if (mime.includes('wav')) return 'voice.wav';
        if (mime.includes('mpeg') || mime.includes('mp3')) return 'voice.mp3';
        return 'voice.oga';
    }

    /**
     * 从 /chat/completions URL 推导 Whisper 转写端点
     */
    private deriveWhisperUrl(): string {
        try {
            const u = new URL(this.config.url);
            const p = u.pathname;
            if (p.includes('/chat/completions')) {
                u.pathname = p.replace(/\/chat\/completions\/?$/, '/audio/transcriptions');
                return u.toString();
            }
            if (p.includes('/messages')) {
                u.pathname = p.replace(/\/messages\/?$/, '/audio/transcriptions');
                return u.toString();
            }
            return '';
        } catch { return ''; }
    }

    /**
     * 启发式判断模型回复是否表明"未收到音频"
     * 覆盖中英文常见的"我没有收到音频"类模型回复
     */
    private looksLikeNoAudio(text: string): boolean {
        const lower = text.toLowerCase();
        const markers = [
            'no audio', 'not provided', 'cannot transcribe', 'no audio file',
            'haven\'t provided', 'don\'t have', 'didn\'t receive', 'wasn\'t provided',
            'provide the audio', 'provide me with', 'provide an audio',
            'upload the audio', 'share the audio', 'send the audio',
            'without any audio', 'no file', 'any audio',
            '没有提供', '未收到', '没有音频', '无法转录', '请提供', '无音频',
        ];
        return markers.some(m => lower.includes(m));
    }

    async transcribe(audioArrayBuffer: ArrayBuffer): Promise<string> {
        const base64Audio = Buffer.from(new Uint8Array(audioArrayBuffer)).toString('base64').replace(/\r?\n|\r/g, "");
        const mimeType = this.detectAudioMime(audioArrayBuffer);
        const headers: Record<string, string> = { ...this.buildHeaders(), "Content-Type": "application/json" };

        // === 策略 1：audio_url + data URI（vLLM / 现代 OpenAI 兼容服务标准） ===
        try {
            const result = await this.chatRequest(headers, {
                model: this.config.model,
                messages: [{
                    role: "user",
                    content: [
                        { type: "text", text: "Please transcribe the following audio accurately. Output ONLY the transcribed text." },
                        { type: "audio_url", audio_url: { url: `data:${mimeType};base64,${base64Audio}` } }
                    ]
                }],
                stream: false
            });
            if (!this.looksLikeNoAudio(result)) return result;
            console.log(`[OmniChat STT] audio_url strategy: model reported no audio, trying fallbacks...`);
        } catch (e: any) {
            console.log(`[OmniChat STT] audio_url strategy failed (${e.status || e.message}), trying fallbacks...`);
        }

        // === 策略 2：推导 Whisper 端点（oMLX 等独立 /v1/audio/transcriptions） ===
        const whisperUrl = this.deriveWhisperUrl();
        if (whisperUrl) {
            try {
                return await this.whisperRequest(whisperUrl, audioArrayBuffer, mimeType);
            } catch (e: any) {
                console.log(`[OmniChat STT] Whisper fallback failed (${e.status || e.message}), trying input_audio...`);
            }
        }

        // === 策略 3：input_audio（OpenAI 原生格式，最终兜底） ===
        return await this.chatRequest(headers, {
            model: this.config.model,
            messages: [{
                role: "user",
                content: [
                    { type: "text", text: "Please transcribe the following audio accurately. Output ONLY the transcribed text." },
                    { type: "input_audio", input_audio: { data: base64Audio, format: this.mimeToFormat(mimeType) } }
                ]
            }],
            stream: false
        });
    }

    /**
     * 发送 Chat Completions 请求并提取文本回复
     */
    private async chatRequest(headers: Record<string, string>, payload: any): Promise<string> {
        const res = await requestUrl({
            url: this.config.url,
            method: "POST",
            headers,
            body: JSON.stringify(payload)
        });

        const msg = res.json.choices?.[0]?.message;
        if (!msg) return JSON.stringify(res.json);
        if (typeof msg.content === 'string') return msg.content.trim();
        if (Array.isArray(msg.content)) {
            return msg.content
                .filter((c: any) => c.type === 'text')
                .map((c: any) => c.text)
                .join('')
                .trim();
        }
        return JSON.stringify(msg);
    }

    /**
     * 通过标准 Whisper 协议（multipart/form-data）发送转写请求
     */
    private async whisperRequest(url: string, audioArrayBuffer: ArrayBuffer, mimeType: string): Promise<string> {
        const boundary = '----IdeaCapture' + Math.random().toString(36).substring(2);
        const enc = new TextEncoder();
        const model = this.config.model || 'whisper-1';
        const filename = this.mimeToFilename(mimeType);

        const p1 = `--${boundary}\r\nContent-Disposition: form-data; name="model"\r\n\r\n${model}\r\n--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\nContent-Type: ${mimeType}\r\n\r\n`;
        const p3 = `\r\n--${boundary}--\r\n`;

        const body = new Uint8Array(enc.encode(p1).byteLength + audioArrayBuffer.byteLength + enc.encode(p3).byteLength);
        body.set(enc.encode(p1), 0);
        body.set(new Uint8Array(audioArrayBuffer), enc.encode(p1).byteLength);
        body.set(enc.encode(p3), enc.encode(p1).byteLength + audioArrayBuffer.byteLength);

        const res = await requestUrl({
            url,
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
