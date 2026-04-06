import TelegramBot from "node-telegram-bot-api";
import { IMProvider } from "./base";
import { IMPlatform, UnifiedMessage } from "../../types";

export class TelegramProvider extends IMProvider {
    platform: IMPlatform = 'telegram';
    bot: TelegramBot | null = null;
    token: string;

    constructor(token: string) {
        super();
        this.token = token;
    }

    async start() {
        if (!this.token) return;
        this.bot = new TelegramBot(this.token, { polling: true });
        
        // 1. 路由普通消息
        this.bot.on('message', (msg) => {
            // 排除激活码指令，其他的（如 /end, /new, /resume）交给 ChatHandler 处理
            if (msg.text?.startsWith('/activate') || msg.text?.startsWith('/active')) return;
            
            const unified: UnifiedMessage = {
                platform: this.platform,
                chatId: msg.chat.id.toString(),
                userId: msg.from?.id.toString() || msg.chat.id.toString(),
                text: msg.text,
                media: msg.voice ? { type: 'voice', fileId: msg.voice.file_id } : 
                       msg.photo ? { type: 'image', fileId: msg.photo[msg.photo.length - 1].file_id } : undefined,
                raw: msg
            };
            this.onMessage?.(unified);
        });

        // 2. 路由激活码
        this.bot.onText(/\/(activate|active) (.+)/, (msg, match) => {
            const code = match ? match[2].trim() : "";
            this.onActivation?.(this.platform, msg.chat.id.toString(), code);
        });

        // 3. 路由回调（按钮点击）
        this.bot.on('callback_query', (query) => {
            if (query.message && query.data) {
                this.onCallbackQuery?.(this.platform, query.message.chat.id.toString(), query.data);
                this.bot?.answerCallbackQuery(query.id);
            }
        });
    }

    async stop() {
        if (this.bot) {
            await this.bot.stopPolling();
            this.bot.removeAllListeners();
            this.bot = null;
        }
    }

    async sendMessage(chatId: string, text: string, options?: any) {
        await this.bot?.sendMessage(parseInt(chatId), text, options);
    }

    async sendAction(chatId: string, action: 'typing' | 'upload_photo' | 'record_voice') {
        const tgAction = action === 'record_voice' ? 'record_audio' : 
                         action === 'upload_photo' ? 'upload_photo' : 'typing';
        await this.bot?.sendChatAction(parseInt(chatId), tgAction);
    }

    async setCommands(commands: Array<{ command: string; description: string }>) {
        if (!this.bot) {
            console.error("[Telegram] 无法设置指令：机器人尚未启动");
            return;
        }
        try {
            await this.bot.setMyCommands(commands);
            console.log("[Telegram] 快捷指令同步成功:", commands.map(c => "/" + c.command).join(", "));
        } catch (e) {
            console.error("[Telegram] 快捷指令同步失败:", e.message);
        }
    }

    // Telegram 特有功能：获取文件链接
    async getFileLink(fileId: string): Promise<string | undefined> {
        return await this.bot?.getFileLink(fileId);
    }
}
