import { UnifiedMessage, IMPlatform } from "../../types";

export abstract class IMProvider {
    abstract platform: IMPlatform;
    
    // 标准生命周期
    abstract start(): Promise<void>;
    abstract stop(): Promise<void>;
    
    // 统一发送消息
    abstract sendMessage(chatId: string, text: string, options?: any): Promise<void>;
    
    // 统一发送交互状态 (如 'typing', 'upload_photo' 等)
    abstract sendAction(chatId: string, action: 'typing' | 'upload_photo' | 'record_voice'): Promise<void>;
    
    // 统一设置命令菜单
    abstract setCommands(commands: Array<{command: string, description: string}>): Promise<void>;

    // 核心钩子：供 ChatHandler 挂载
    onMessage?: (msg: UnifiedMessage) => Promise<void>;
    onActivation?: (platform: IMPlatform, chatId: string, code: string) => Promise<void>;
    onCallbackQuery?: (platform: IMPlatform, chatId: string, data: string) => Promise<void>;
}
