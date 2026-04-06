import { OpenAIProvider } from "./openai";

/**
 * Xiaomi MiMo 服务提供商
 * 协议：OpenAI 兼容
 * 特性：强制使用 api-key Header 进行身份验证
 */
export class XiaomiProvider extends OpenAIProvider {
    
    /**
     * 重写认证头组装 (Hooks)
     * 解决小米接口对标准 Authorization 头的敏感冲突
     */
    protected buildHeaders(): Record<string, string> {
        return {
            "Content-Type": "application/json",
            "api-key": this.config.key.trim()
        };
    }
}
