import { App, requestUrl, Notice, moment } from "obsidian";
import { IdeaCaptureSettings, PROVIDERS } from "../types";
import { STTProviderFactory } from "./stt/factory";
import { VisionProviderFactory } from "./vision/factory";
import { SearchProviderFactory } from "./search/factory";

export class MediaService {
    app: App;
    settings: IdeaCaptureSettings;
    decrypt: (hash: string) => string;

    constructor(app: App, settings: IdeaCaptureSettings, decryptFn: (hash: string) => string) {
        this.app = app;
        this.settings = settings;
        this.decrypt = decryptFn;
    }

    async callSearch(query: string): Promise<string> {
        const provider = SearchProviderFactory.getProvider(this.settings, this.decrypt);
        if (!provider) return '';
        try {
            return await provider.search(query);
        } catch (e) { 
            return `[SEARCH_ERROR]: ${provider.label} 搜索失败 (${e.message || '网络错误'})`; 
        }
    }

    async fetchWebpageContent(url: string): Promise<string> {
        try {
            const res = await requestUrl({ url });
            const titleMatch = res.text.match(/<title>(.*?)<\/title>/i);
            return `[Link Title]: ${titleMatch ? titleMatch[1].trim() : 'Web Page'}\nURL: ${url}`;
        } catch (e) { return `[Link]: ${url}`; }
    }

    async callVision(absPath: string): Promise<string> {
        const provider = VisionProviderFactory.getProvider(this.settings, this.decrypt);
        if (!provider) return '';

        // 探测逻辑 (针对本地 imgAPI)
        if ((provider as any).config.url.includes('127.0.0.1:8001')) {
            try { await requestUrl({ url: 'http://127.0.0.1:8001/vision', method: 'HEAD' }); } catch(e) { return "[VISION_ERROR]: 本地视觉补丁未启动"; }
        }

        try {
            const adapter = this.app.vault.adapter;
            let base64Data = "";
            try {
                const relPath = absPath.replace(adapter.basePath, "").replace(/^\//, "");
                const arrayBuffer = await adapter.readBinary(relPath);
                base64Data = Buffer.from(arrayBuffer).toString('base64');
            } catch(e) { base64Data = absPath; }

            return await provider.understandImage(base64Data, "详细描述图中内容");
        } catch (e) {
            return `[VISION_ERROR]: ${provider.label} 识别异常 (${e.message || '网络超时'})`;
        }
    }

    async transcribeVoice(audioArrayBuffer: ArrayBuffer): Promise<string> {
        const provider = STTProviderFactory.getProvider(this.settings, this.decrypt);
        if (!provider) return '';
        try {
            return await provider.transcribe(audioArrayBuffer);
        } catch (e) {
            return `[STT_ERROR]: ${provider.label} 转写失败 (${e.message || '请求超时'})`;
        }
    }
}
