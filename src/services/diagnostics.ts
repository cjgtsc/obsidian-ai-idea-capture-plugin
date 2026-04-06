import { IdeaCaptureSettings } from "../types";
import { LLMProviderFactory } from "./llm/factory";
import { STTProviderFactory } from "./stt/factory";
import { VisionProviderFactory } from "./vision/factory";
import { SearchProviderFactory } from "./search/factory";
import { AUDIO_SAMPLES } from "../assets/audio_samples";

/**
 * 诊断服务 (DiagnosticsService)
 * 职责：验证各模块 Provider 的连通性。
 * 实现：复用各模块的工厂类，确保测试环境与实战环境 100% 对齐。
 */
export class DiagnosticsService {
    settings: IdeaCaptureSettings;
    decrypt: (hash: string) => string;

    constructor(settings: IdeaCaptureSettings, decryptFn: (hash: string) => string) {
        this.settings = settings;
        this.decrypt = decryptFn;
    }

    async testConnection(type: 'llm' | 'stt' | 'vision' | 'search', pid: string, conf: any): Promise<{success: boolean, message: string}> {
        try {
            if (type === 'llm') {
                const provider = LLMProviderFactory.getProvider(this.settings, this.decrypt);
                return await provider.testConnection();
            }
            
            if (type === 'stt') {
                const provider = STTProviderFactory.getProvider(this.settings, this.decrypt);
                if (!provider) throw new Error("STT Provider 实例化失败");
                const byteCharacters = atob(AUDIO_SAMPLES.hello_mp3);
                const audioArray = new Uint8Array(byteCharacters.length);
                for (let i = 0; i < byteCharacters.length; i++) { audioArray[i] = byteCharacters.charCodeAt(i); }
                return await provider.testConnection(audioArray.buffer);
            }

            if (type === 'vision') {
                const provider = VisionProviderFactory.getProvider(this.settings, this.decrypt);
                if (!provider) throw new Error("Vision Provider 实例化失败");
                return await provider.testConnection();
            }

            if (type === 'search') {
                const provider = SearchProviderFactory.getProvider(this.settings, this.decrypt);
                if (!provider) throw new Error("Search Provider 实例化失败或未配置");
                return await provider.testConnection();
            }

            return { success: false, message: `不支持 [${type}] 模块的诊断` };
        } catch (e) {
            return { success: false, message: e.message || "测试过程异常" };
        }
    }
}
