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
                finalLabel = `Reuse ${llmMeta.label} (STT Path)`;
            } else {
                finalUrl = (llmUserConf.url || llmMeta.url || "").trim();
                finalModel = (llmUserConf.model || llmMeta.model || "").trim();
                finalLabel = `Reuse ${llmMeta.label} (Omni Path)`;
            }
        }

        const config = { url: finalUrl, model: finalModel, key: finalKey };

        // 2. 精准路由分发
        switch (factoryId) {
            case 'google': 
                return new GeminiSTTProvider(factoryId, finalLabel, config);
            case 'xiaomi': 
                return new XiaomiSTTProvider(factoryId, finalLabel, config);
            case 'openai':
            case 'openai-whisper': 
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
            case 'custom-openai':
                return new OpenAISTTProvider(factoryId, finalLabel, config);
            default:
                // 默认回退到 OpenAI 标准适配器
                return new OpenAISTTProvider(factoryId, finalLabel, config);
        }
    }
}
