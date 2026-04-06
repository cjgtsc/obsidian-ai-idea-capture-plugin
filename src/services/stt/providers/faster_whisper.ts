import { WhisperBaseProvider } from "./whisper_base";
import { requestUrl } from "obsidian";

/**
 * Faster-Whisper (Local API) 服务提供商
 * 协议特点：
 * 1. 深度兼容 OpenAI Whisper 接口 (POST /v1/audio/transcriptions)。
 * 2. 通常运行于本地 8000/8080 端口。
 * 3. 优势在于隐私保护与零成本。
 */
export class FasterWhisperProvider extends WhisperBaseProvider {

    /**
     * 重写测试连接逻辑
     * 对于本地服务，我们可以通过 GET 请求判定其端口是否开放
     */
    async testConnection(testAudio: ArrayBuffer): Promise<{ success: boolean; message: string }> {
        try {
            // 尝试获取模型列表，这是判定 Whisper Server 是否存活的最标准方式
            const baseUrl = this.config.url.split('/v1')[0];
            const res = await requestUrl({ 
                url: `${baseUrl}/v1/models`, 
                method: 'GET' 
            });
            
            if (res.status === 200) {
                return { success: true, message: "Faster-Whisper 服务在线！" };
            }
            // 如果不支持 /models，则回退到发送微音频流
            return super.testConnection(testAudio);
        } catch (e) {
            return { success: false, message: "无法连接到本地 Faster-Whisper，请确保服务已启动 (默认 8000 端口)。" };
        }
    }
}
