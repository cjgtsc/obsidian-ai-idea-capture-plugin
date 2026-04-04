import { IdeaCaptureSettings, PROVIDERS } from "../../types";
import { BaseLLMProvider } from "./base";
import { OpenAIProvider } from "./providers/openai";
import { MiniMaxCNProvider } from "./providers/minimax_cn";
import { MiniMaxProvider } from "./providers/minimax";
import { XiaomiProvider } from "./providers/xiaomi";
import { AnthropicProvider } from "./providers/anthropic";
import { GoogleProvider } from "./providers/google";
import { DeepSeekProvider } from "./providers/deepseek";
import { KimiProvider } from "./providers/kimi";
import { KimiCNProvider } from "./providers/kimi_cn";
import { QwenProvider } from "./providers/qwen";
import { QwenCNProvider } from "./providers/qwen_cn";
import { GLMProvider } from "./providers/glm";
import { GLMCNProvider } from "./providers/glm_cn";
import { StepFunProvider } from "./providers/stepfun";
import { StepFunCNProvider } from "./providers/stepfun_cn";
import { OpenRouterProvider } from "./providers/openrouter";
import { SiliconFlowProvider } from "./providers/siliconflow";
import { GroqProvider } from "./providers/groq";
import { OllamaProvider } from "./providers/ollama";
import { GrokProvider } from "./providers/grok";

export class LLMProviderFactory {
    static getProvider(settings: IdeaCaptureSettings, decryptFn: (h: string) => string): BaseLLMProvider {
        const currentId = settings.llm.current;
        const meta = (PROVIDERS.llm as any)[currentId];
        const userConf = settings.llm.providers[currentId];

        const config = {
            url: (userConf.url || meta.url || "").trim(),
            model: (userConf.model || meta.model || "").trim(),
            key: decryptFn(userConf.key).trim()
        };

        // 1. 特化厂商 ID 优先 (彻底解耦关键厂商及国内外版本)
        switch (currentId) {
            case 'xiaomi': return new XiaomiProvider(currentId, meta.label, config);
            case 'anthropic': return new AnthropicProvider(currentId, meta.label, config);
            case 'google': return new GoogleProvider(currentId, meta.label, config);
            case 'minimax-cn': return new MiniMaxCNProvider(currentId, meta.label, config);
            case 'minimax': return new MiniMaxProvider(currentId, meta.label, config);
            case 'deepseek': return new DeepSeekProvider(currentId, meta.label, config);
            case 'kimi-cn': return new KimiCNProvider(currentId, meta.label, config);
            case 'kimi': return new KimiProvider(currentId, meta.label, config);
            case 'qwen-cn': return new QwenCNProvider(currentId, meta.label, config);
            case 'qwen': return new QwenProvider(currentId, meta.label, config);
            case 'glm-cn': return new GLMCNProvider(currentId, meta.label, config);
            case 'glm': return new GLMProvider(currentId, meta.label, config);
            case 'stepfun-cn': return new StepFunCNProvider(currentId, meta.label, config);
            case 'stepfun': return new StepFunProvider(currentId, meta.label, config);
            case 'openrouter': return new OpenRouterProvider(currentId, meta.label, config);
            case 'siliconflow': return new SiliconFlowProvider(currentId, meta.label, config);
            case 'groq': return new GroqProvider(currentId, meta.label, config);
            case 'ollama': return new OllamaProvider(currentId, meta.label, config);
            case 'grok': return new GrokProvider(currentId, meta.label, config);
            default:
                // 如果未命中特化 ID，则根据协议类型分发
                const protocol = meta.protocol || 'openai-chat';
                switch (protocol) {
                    case 'minimax-v1':
                        return new MiniMaxProvider(currentId, meta.label, config);
                    default:
                        return new OpenAIProvider(currentId, meta.label, config);
                }
        }
    }
}
