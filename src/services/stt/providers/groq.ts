import { WhisperBaseProvider } from "./whisper_base";

/**
 * Groq STT 服务提供商
 * 协议特点：极速转写，完全兼容 Whisper 格式
 */
export class GroqSTTProvider extends WhisperBaseProvider {
    // 预留针对 Groq 吞吐量优化的钩子
}
