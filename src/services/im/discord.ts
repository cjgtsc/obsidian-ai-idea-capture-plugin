import { Client, GatewayIntentBits, Message, Events, Partials } from 'discord.js';
import { IMProvider } from "./base";
import { IMPlatform, UnifiedMessage } from "../../types";

export class DiscordProvider extends IMProvider {
    platform: IMPlatform = 'discord';
    client: Client | null = null;
    token: string;

    constructor(token: string) {
        super();
        this.token = token;
    }

    async start() {
        if (!this.token || this.token.trim() === "") {
            new Notice("⚠️ Discord: No Bot Token found. Please enter it in settings.");
            return;
        }

        this.client = new Client({
            intents: [
                GatewayIntentBits.Guilds,
                GatewayIntentBits.GuildMessages,
                GatewayIntentBits.DirectMessages,
                GatewayIntentBits.MessageContent,
            ],
            partials: [Partials.Channel] // 必须有这个才能在 DM 中接收消息
        });

        this.client.on(Events.MessageCreate, async (msg: Message) => {
            if (msg.author.bot) return;

            const content = msg.content.trim();
            
            // 1. 路由激活码 (/activate 或 /active)
            if (content.startsWith('/activate') || content.startsWith('/active')) {
                const parts = content.split(' ');
                const code = parts.length > 1 ? parts[1] : "";
                this.onActivation?.(this.platform, msg.author.id, code);
                return;
            }

            // 2. 路由普通消息
            const unified: UnifiedMessage = {
                platform: this.platform,
                chatId: msg.channelId,
                userId: msg.author.id,
                text: content,
                media: this.extractMedia(msg),
                raw: msg
            };
            this.onMessage?.(unified);
        });

        this.client.on(Events.Error, (error) => {
            console.error("Discord Client Error:", error);
        });

        try {
            await this.client.login(this.token);
        } catch (e) {
            console.error("Discord Login Error:", e);
        }
    }

    private extractMedia(msg: Message) {
        if (msg.attachments.size > 0) {
            const attachment = msg.attachments.first();
            if (attachment?.contentType?.startsWith('image/')) {
                return { type: 'image' as const, fileId: attachment.url }; // Discord 直接用 URL 即可
            }
            if (attachment?.contentType?.startsWith('audio/')) {
                return { type: 'voice' as const, fileId: attachment.url };
            }
        }
        return undefined;
    }

    async stop() {
        if (this.client) {
            this.client.destroy();
            this.client = null;
        }
    }

    async sendMessage(chatId: string, text: string, options?: any) {
        if (!this.client || !this.client.isReady()) return;
        try {
            // 1. 优先尝试作为用户发送 DM (绑定场景最常用)
            try {
                const user = await this.client.users.fetch(chatId);
                if (user) {
                    await user.send(text);
                    return;
                }
            } catch (e) {
                // 如果不是用户 ID，继续尝试频道路径
            }

            // 2. 尝试作为频道发送
            let channel = this.client.channels.cache.get(chatId);
            if (!channel) {
                channel = await this.client.channels.fetch(chatId) as any;
            }

            if (channel?.isTextBased()) {
                await (channel as any).send(text);
            }
        } catch (e) {
            console.error("Discord Send Error:", e);
        }
    }

    async sendAction(chatId: string, action: 'typing' | 'upload_photo' | 'record_voice') {
        if (!this.client || !this.client.isReady()) return;
        try {
            // 尝试获取频道并发送 typing 状态
            let channel = this.client.channels.cache.get(chatId);
            if (!channel) {
                try {
                    channel = await this.client.channels.fetch(chatId) as any;
                } catch (e) {
                    // 如果不是频道，可能是用户 ID (DM)
                    const user = await this.client.users.fetch(chatId);
                    if (user) {
                        const dm = await user.createDM();
                        await dm.sendTyping();
                        return;
                    }
                }
            }
            if (channel?.isTextBased()) {
                await (channel as any).sendTyping();
            }
        } catch (e) {
            console.error("Discord Typing Error:", e);
        }
    }

    async setCommands(commands: Array<{ command: string; description: string }>) {
        // Discord 的 Slash Commands 设置比较复杂，需要 REST API。
        // 这里暂时作为占位，或者后续通过 Discord Developer Portal 手动设置。
        console.log("Discord commands set (placeholder):", commands);
    }
}
