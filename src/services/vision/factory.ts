import { IdeaCaptureSettings, PROVIDERS } from "../../types";
import { BaseVisionProvider } from "./base";
import { OpenAIVisionProvider } from "./providers/openai";
import { GoogleVisionProvider } from "./providers/google";
import { AnthropicVisionProvider } from "./providers/anthropic";
import { SiliconFlowVisionProvider } from "./providers/siliconflow";
import { OllamaVisionProvider } from "./providers/ollama";
import { OpenRouterVisionProvider } from "./providers/openrouter";

export class VisionProviderFactory {
    static getProvider(settings: IdeaCaptureSettings, decryptFn: (h: string) => string): BaseVisionProvider | null {
        const conf = settings.vision;
        const currentId = conf.current;
        if (currentId === 'none') return null;

        const meta = (PROVIDERS.vision as any)[currentId];
        let userConf = conf.providers[currentId];
        
        let finalKey = "";
        try { finalKey = decryptFn(userConf?.key || "").trim(); } catch(e) {}
        
        let finalUrl = (userConf?.url || meta.url || "").trim();
        let finalModel = (userConf?.model || meta.model || "").trim();
        let finalLabel = meta.label;

        // 1. 处理复用 LLM 配置 (Omni Reuse)
        let factoryId = currentId;
        if ((conf as any).useLLM) {
            const llmId = settings.llm.current;
            const llmUserConf = settings.llm.providers[llmId];
            const llmMeta = (PROVIDERS.llm as any)[llmId];
            
            finalKey = decryptFn(llmUserConf.key).trim();
            factoryId = llmId;

            // 智能路径映射：尝试在 Vision 预设里寻找同名或 vision 后缀厂商
            const visionPreset = (PROVIDERS.vision as any)[llmId] || (PROVIDERS.vision as any)[llmId + '-vision'];
            
            if (visionPreset) {
                finalUrl = (llmUserConf.url || visionPreset.url || "").trim();
                finalModel = (llmUserConf.model || visionPreset.model || "").trim();
                finalLabel = `Reuse ${llmMeta.label} (Vision Path)`;
            } else {
                finalUrl = (llmUserConf.url || llmMeta.url || "").trim();
                finalModel = (llmUserConf.model || llmMeta.model || "").trim();
                finalLabel = `Reuse ${llmMeta.label} (Omni Path)`;
            }
        }

        const config = { url: finalUrl, model: finalModel, key: finalKey };
        
        // 2. 精准路由分发 (特化厂商 ID 优先)
        switch (factoryId) {
            case 'google':
                return new GoogleVisionProvider(factoryId, finalLabel, config);
            case 'anthropic':
            case 'custom-anthropic':
                return new AnthropicVisionProvider(factoryId, finalLabel, config);
            case 'siliconflow':
            case 'siliconflow-vision':
                return new SiliconFlowVisionProvider(factoryId, finalLabel, config);
            case 'ollama':
            case 'ollama-vision':
                return new OllamaVisionProvider(factoryId, finalLabel, config);
            case 'openrouter':
                return new OpenRouterVisionProvider(factoryId, finalLabel, config);
            case 'openai':
            case 'custom-openai':
            default:
                // 如果未命中特化厂商，或者协议是 openai-chat，则默认使用 OpenAI 兼容适配器
                return new OpenAIVisionProvider(factoryId, finalLabel, config);
        }
    }
}
