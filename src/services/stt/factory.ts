import { IdeaCaptureSettings, PROVIDERS } from "../../types";
import { BaseSTTProvider } from "./base";
import { GeminiSTTProvider } from "./providers/gemini";
import { XiaomiSTTProvider } from "./providers/xiaomi";
import { OpenAISTTProvider } from "./providers/openai";
import { GroqSTTProvider } from "./providers/groq";
import { SiliconFlowSTTProvider } from "./providers/siliconflow";
import { OllamaSTTProvider } from "./providers/ollama";
import { FasterWhisperProvider } from "./providers/faster_whisper";
import { OpenRouterSTTProvider } from "./providers/openrouter";
import { OmniChatSTTProvider } from "./providers/omni_chat";

export class STTProviderFactory {
    static getProvider(settings: IdeaCaptureSettings, decryptFn: (h: string) => string): BaseSTTProvider | null {
        const conf = settings.stt;
        const currentId = conf.current;
        if (currentId === 'none') return null;

        const meta = (PROVIDERS.stt as any)[currentId];
        let userConf = conf.providers[currentId];
        
        let finalKey = "";
        try { finalKey = decryptFn(userConf?.key || ""); } catch(e) {}
        
        let finalUrl = userConf?.url || meta.url;
        let finalModel = userConf?.model || meta.model;
        let finalLabel = meta.label;

        // 1. 处理全模态复用逻辑 (Omni Reuse)
        let factoryId = currentId;
        // 标记是否来自复用路径，且无匹配的标准 STT 协议（需走 Omni Chat 路径）
        let useOmniPath = false;
        if ((conf as any).useLLM) {
            const llmId = settings.llm.current;
            const llmUserConf = settings.llm.providers[llmId];
            const llmMeta = (PROVIDERS.llm as any)[llmId];
            
            finalKey = decryptFn(llmUserConf.key);
            factoryId = llmId;

            // 智能路径映射：尝试在 STT 预设里寻找同名或 whisper 后缀厂商
            const sttPreset = (PROVIDERS.stt as any)[llmId] || (PROVIDERS.stt as any)[llmId + '-whisper'];

            if (sttPreset) {
                finalUrl = (llmUserConf.url || sttPreset.url || "").trim();
                finalModel = (llmUserConf.model || sttPreset.model || "").trim();
                
                // 智能协议嗅探：即使预设了 STT 协议，若用户实际填写的 URL 明显是 Chat 接口
                // (如 /chat/completions)，则视为用户采用了多模态模型进行复用，强制切换到 Omni 路径
                const isChatEndpoint = finalUrl.includes('chat/completions') || finalUrl.includes('/messages');
                
                if (isChatEndpoint) {
                    finalLabel = `Reuse ${llmMeta.label} (Omni Path)`;
                    useOmniPath = true;
                } else {
                    finalLabel = `Reuse ${llmMeta.label} (STT Path)`;
                }
            } else {
                finalUrl = (llmUserConf.url || llmMeta.url || "").trim();
                finalModel = (llmUserConf.model || llmMeta.model || "").trim();
                finalLabel = `Reuse ${llmMeta.label} (Omni Path)`;
                // 没有匹配到标准 STT 协议，说明是纯多模态 LLM，必须走 Omni Chat 路径
                useOmniPath = true;
            }
        }

        const config = { url: finalUrl, model: finalModel, key: finalKey };

        // 2. 精准路由分发
        // 如果系统判定必须走 Omni Path（多模态复用 API），优先抛向多模态特化提供商
        if (useOmniPath) {
            if (factoryId === 'xiaomi') return new XiaomiSTTProvider(factoryId, finalLabel, config);
            if (factoryId === 'google') return new GeminiSTTProvider(factoryId, finalLabel, config);
            if (factoryId === 'openrouter') return new OpenRouterSTTProvider(factoryId, finalLabel, config);
            // 其它均落入通用全模态适配器（包括 custom-openai 等），以规避向 /chat 接口发送 multipart 数据
            return new OmniChatSTTProvider(factoryId, finalLabel, config);
        }

        switch (factoryId) {
            case 'google': 
                return new GeminiSTTProvider(factoryId, finalLabel, config);
            case 'xiaomi': 
                return new XiaomiSTTProvider(factoryId, finalLabel, config);
            case 'openai':
            case 'openai-whisper': 
            case 'custom-openai':
                return new OpenAISTTProvider(factoryId, finalLabel, config);
            case 'groq':
            case 'groq-whisper': 
                return new GroqSTTProvider(factoryId, finalLabel, config);
            case 'siliconflow':
            case 'siliconflow-whisper': 
                return new SiliconFlowSTTProvider(factoryId, finalLabel, config);
            case 'ollama':
            case 'ollama-stt': 
                return new OllamaSTTProvider(factoryId, finalLabel, config);
            case 'faster-whisper':
                return new FasterWhisperProvider(factoryId, finalLabel, config);
            case 'openrouter':
                return new OpenRouterSTTProvider(factoryId, finalLabel, config);
            default:
                return new OpenAISTTProvider(factoryId, finalLabel, config);
        }
    }
}
