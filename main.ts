import { Plugin, moment } from "obsidian";
import { t, setLanguage } from './src/i18n';
import { IdeaCaptureSettings, DEFAULT_SETTINGS, IMPlatform } from "./src/types";
import { IdeaCaptureSettingTab } from "./src/ui";
import { SecurityManager } from "./src/core/security";
import { SessionManager } from "./src/core/session";
import { LLMService } from "./src/services/llm";
import { MediaService } from "./src/services/media";
import { ChatHandler } from "./src/core/handler";
import { TelegramProvider } from "./src/services/im/telegram";
import { DiscordProvider } from "./src/services/im/discord";
import { AuthService } from "./src/core/auth";
import { DiagnosticsService } from "./src/services/diagnostics";

export { DEFAULT_SETTINGS };

export default class IdeaCapturePlugin extends Plugin {
    settings: IdeaCaptureSettings;
    securityManager: SecurityManager;
    sessionManager: SessionManager;
    llmService: LLMService;
    mediaService: MediaService;
    chatHandler: ChatHandler;
    authService: AuthService;
    diagnosticsService: DiagnosticsService;
    settingTab: IdeaCaptureSettingTab;

    async onload() {
        await this.loadSettings();
        setLanguage(this.settings.language);

        // 1. Initialize Managers
        this.securityManager = new SecurityManager(this.app, this.manifest.dir);
        await this.securityManager.init();
        
        this.sessionManager = new SessionManager(this.app, this.manifest.dir);
        await this.sessionManager.init();

        // 2. Initialize Auth Service (Early sanitize)
        this.authService = new AuthService(this.settings, () => this.saveSettings());
        await this.authService.sanitizeData();

        this.diagnosticsService = new DiagnosticsService(this.settings, (h) => this.securityManager.decrypt(h));

        // 3. Initialize Services
        this.llmService = new LLMService(this.settings, (h) => this.securityManager.decrypt(h));
        this.mediaService = new MediaService(this.settings, (h) => this.securityManager.decrypt(h));

        // 4. Initialize Handler (The Brain)
        this.chatHandler = new ChatHandler(this.app, this.settings, this.llmService, this.mediaService, this.sessionManager, this.securityManager, this.authService);
        
        // 5. Auth Event Sync
        this.authService.on("auth-changed", async (data) => {
            if (data.type === "unbind") {
                this.chatHandler.activeSessions.delete(`${data.platform}:${data.userId}`);
                // 发送解绑成功通知
                await this.chatHandler.sendMessage(data.platform, data.userId, t('unbindSuccess'));
            }
            if (this.settingTab) this.settingTab.display();
        });

        // 6. Setup IM Providers
        this.initIM();

        // 7. Setup UI
        this.settingTab = new IdeaCaptureSettingTab(this.app, this);
        this.addSettingTab(this.settingTab);
    }

    onunload() {
        this.chatHandler.imProviders.forEach(p => p.stop());
        this.chatHandler.stop();
        this.authService.removeAllListeners();
    }

    async loadSettings() {
        const loaded = await this.loadData();
        this.settings = JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
        Object.assign(this.settings, loaded);
        
        if (loaded && loaded.im) {
            for (const p in loaded.im) {
                if (this.settings.im[p as IMPlatform]) {
                    Object.assign(this.settings.im[p as IMPlatform], loaded.im[p]);
                }
            }
        }

        // v0.3.0 数据结构对齐：确保 AI 服务商配置正确合并
        const aiServices: Array<'llm' | 'stt' | 'vision' | 'search'> = ['llm', 'stt', 'vision', 'search'];
        aiServices.forEach(s => {
            // 确保每个在 DEFAULT_SETTINGS 中定义的厂商都存在
            for (const pid in DEFAULT_SETTINGS[s].providers) {
                if (!this.settings[s].providers[pid]) {
                    this.settings[s].providers[pid] = { key: '' };
                }
            }

            if (loaded && loaded[s] && loaded[s].providers) {
                for (const pid in loaded[s].providers) {
                    if (this.settings[s].providers[pid]) {
                        Object.assign(this.settings[s].providers[pid], loaded[s].providers[pid]);
                    }
                }
            }
        });
    }

    async saveSettings() {
        await this.saveData(this.settings);
    }

    async initIM() {
        this.chatHandler.imProviders.forEach(p => p.stop());
        this.chatHandler.imProviders.clear();

        if (this.settings.activePlatform === "telegram") {
            const tgToken = this.securityManager.decrypt(this.settings.im.telegram.token);
            if (tgToken) {
                const tg = new TelegramProvider(tgToken);
                this.chatHandler.imProviders.set('telegram', tg);
                await tg.start();
                this.setupProvider(tg);
            }
        } else if (this.settings.activePlatform === "discord") {
            const dsToken = this.securityManager.decrypt(this.settings.im.discord.token);
            if (dsToken) {
                const ds = new DiscordProvider(dsToken);
                this.chatHandler.imProviders.set('discord', ds);
                await ds.start();
                this.setupProvider(ds);
            }
        }
    }

    private setupProvider(provider: any) {
        provider.onMessage = (msg: any) => this.chatHandler.handleMessage(msg);
        provider.onActivation = (plat: IMPlatform, chatId: string, code: string) => this.handleActivation(plat, chatId, code);
        provider.onCallbackQuery = (plat: IMPlatform, chatId: string, data: string) => this.handleCallback(plat, chatId, data);
        
        provider.setCommands([
            { command: 'help', description: t('help') },
            { command: 'end', description: t('end') },
            { command: 'new', description: t('new') },
            { command: 'resume', description: t('resume') },
            { command: 'drop', description: t('drop') }
        ]);
    }

    async handleActivation(platform: IMPlatform, chatId: string, code: string) {
        const res = await this.authService.validateAndBind(platform, chatId, code);
        if (res.success) {
            await this.chatHandler.sendMessage(platform, chatId, t(res.messageKey));
        } else {
            // imBindingCheck 需要特殊处理，它是提示需要解绑
            if (res.messageKey === "imBindingCheck") {
                const pName = this.settings.activePlatform.charAt(0).toUpperCase() + this.settings.activePlatform.slice(1);
                await this.chatHandler.sendMessage(platform, chatId, "⚠️ " + t("imBindingCheck").replace(/{name}/g, pName));
            } else {
                await this.chatHandler.sendMessage(platform, chatId, "❌ " + t(res.messageKey));
            }
        }
    }

    async handleCallback(platform: IMPlatform, chatId: string, data: string) {
        const [action, sid] = data.split(':');
        if (action === 'resume') {
            const s = await this.sessionManager.getSession(sid);
            if (s) {
                s.status = 'CAPTURING';
                this.chatHandler.activeSessions.set(`${platform}:${chatId}`, s);
                await this.chatHandler.sendMessage(platform, chatId, '✅ 已恢复: ' + s.theme);
            }
        } else if (action === 'start_new') {
            await this.chatHandler.startNewSession(platform, chatId, true);
        }
    }
}
