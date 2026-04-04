import { Notice, TFile, moment, App, requestUrl } from "obsidian";
import { SessionData, IdeaCaptureSettings, UnifiedMessage, IMPlatform } from "../types";
import { LLMService } from "../services/llm";
import { MediaService } from "../services/media";
import { SessionManager } from "./session";
import { SecurityManager } from "./security";
import { AuthService } from "./auth";
import { t } from "../i18n";
import { NoteTemplates } from "../templates";
import { IMProvider } from "../services/im/base";
import * as nodePath from 'path';

export class ChatHandler {
    app: App;
    settings: IdeaCaptureSettings;
    imProviders: Map<IMPlatform, IMProvider> = new Map();
    llm: LLMService;
    media: MediaService;
    sessionManager: SessionManager;
    security: SecurityManager;
    auth: AuthService;

    activeSessions: Map<string, SessionData> = new Map(); 
    archiveTimers: Map<string, NodeJS.Timeout> = new Map();
    interactionTimers: Map<string, NodeJS.Timeout> = new Map();

    constructor(app: App, settings: IdeaCaptureSettings, llm: LLMService, media: MediaService, sessionManager: SessionManager, security: SecurityManager, auth: AuthService) {
        this.app = app;
        this.settings = settings;
        this.llm = llm;
        this.media = media;
        this.sessionManager = sessionManager;
        this.security = security;
        this.auth = auth;
    }

    async sendMessage(platform: IMPlatform, chatId: string, text: string, options?: any) {
        await this.imProviders.get(platform)?.sendMessage(chatId, text, options);
    }

    async withAction<T>(platform: IMPlatform, chatId: string, actionType: 'typing' | 'upload_photo' | 'record_voice', action: () => Promise<T>): Promise<T> {
        const provider = this.imProviders.get(platform);
        if (!provider) return await action();
        provider.sendAction(chatId, actionType).catch(() => {});
        const timer = setInterval(() => { provider.sendAction(chatId, actionType).catch(() => {}); }, 4500);
        try { return await action(); } finally { clearInterval(timer); }
    }

    async withTyping<T>(platform: IMPlatform, chatId: string, action: () => Promise<T>): Promise<T> {
        return this.withAction(platform, chatId, 'typing', action);
    }

    async handleMessage(msg: UnifiedMessage) {
        if (!this.auth.isAuthorized(msg.platform, msg.userId)) {
            await this.sendMessage(msg.platform, msg.chatId, t('notAuthorized'));
            return;
        }

        const sessionKey = `${msg.platform}:${msg.chatId}`;

        // --- 1. 指令解析 (Commands) ---
        if (msg.text?.startsWith('/')) {
            const cmd = msg.text.trim().split(' ')[0].toLowerCase();
            
            // A. 丢弃指令
            if (cmd === '/drop') {
                if (this.archiveTimers.has(sessionKey)) clearTimeout(this.archiveTimers.get(sessionKey)!);
                if (this.interactionTimers.has(sessionKey)) clearTimeout(this.interactionTimers.get(sessionKey)!);
                this.activeSessions.delete(sessionKey);
                await this.sendMessage(msg.platform, msg.chatId, t("dropSuccess"));
                return;
            }

            // B. 结束/新话题指令
            if (cmd === '/end' || cmd === '/new') {
                const s = this.activeSessions.get(sessionKey);
                if (s && s.fragments.length > 0) await this.flushBuffer(msg.platform, msg.chatId);
                else if (cmd === '/new') await this.startNewSession(msg.platform, msg.chatId, true);
                return;
            }

            // C. 恢复指令
            if (cmd === '/resume') {
                const s = await this.sessionManager.getLastSubstantialSession();
                if (s) {
                    s.status = 'CAPTURING';
                    this.activeSessions.set(sessionKey, s);
                    this.resetTimers(msg.platform, msg.chatId);
                    await this.sendMessage(msg.platform, msg.chatId, t("resumeSuccess").replace("{{theme}}", s.theme));
                } else {
                    await this.sendMessage(msg.platform, msg.chatId, t("resumeFailed"));
                }
                return;
            }

            // D. 帮助指令
            if (cmd === '/help' || cmd === '/start') {
                const helpMsg = `<b>${t("helpHeader")}</b>\n\n` +
                    `${t("helpStep1")}\n` +
                    `${t("helpStep2").replace("{{time}}", String(this.settings.bufferTime))}\n\n` +
                    `<b>${t("helpCmdHeader")}</b>\n` +
                    `${t("helpCmdResume")}\n` +
                    `${t("helpCmdEnd")}\n` +
                    `${t("helpCmdNew")}\n` +
                    `${t("helpCmdDrop")}`;
                await this.sendMessage(msg.platform, msg.chatId, helpMsg, { parse_mode: 'HTML' });
                return;
            }
        }

        // --- 2. 预处理多模态内容 ---
        let processedContent = msg.text || '';
        let mediaEmbed = '';

        if (msg.media?.type === 'voice') {
            const provider = this.imProviders.get(msg.platform);
            let link = "";
            if (msg.media.fileId.startsWith('http')) link = msg.media.fileId;
            else link = await (provider as any).getFileLink?.(msg.media.fileId);
            
            if (link) {
                processedContent = await this.withAction(msg.platform, msg.chatId, 'record_voice', async () => {
                    try {
                        const audioRes = await requestUrl({ url: link, method: 'GET' });
                        const txt = await this.media.transcribeVoice(audioRes.arrayBuffer);
                        if (txt.startsWith('[STT_ERROR]')) {
                            await this.sendMessage(msg.platform, msg.chatId, `⚠️ ${txt.replace('[STT_ERROR]: ', '')}\n已为您切换至[无声]模式处理。`);
                            return '[语音转文字异常]';
                        }
                        await this.sendMessage(msg.platform, msg.chatId, `🎙️ 识别到：\n"${txt}"`);
                        return '[语音]: ' + txt;
                    } catch(e) { return '[语音下载失败]'; }
                });
            }
        } else if (msg.media?.type === 'image') {
            const provider = this.imProviders.get(msg.platform);
            let link = "";
            if (msg.media.fileId.startsWith('http')) link = msg.media.fileId;
            else link = await (provider as any).getFileLink?.(msg.media.fileId);

            if (link) {
                const visionResult = await this.withAction(msg.platform, msg.chatId, 'upload_photo', async () => {
                    const attachDir = this.settings.inboxFolder + "/Attachments";
                    try {
                        const fileName = await this.downloadFile(link, 'jpg', attachDir);
                        if (fileName) {
                            const adapter = this.app.vault.adapter as any;
                            const absPath = nodePath.join(adapter.basePath, attachDir, fileName);
                            const desc = await this.media.callVision(absPath);
                            const fullVaultPath = `${this.settings.inboxFolder}/Attachments/${fileName}`;
                            if (desc.startsWith('[VISION_ERROR]')) {
                                await this.sendMessage(msg.platform, msg.chatId, `⚠️ ${desc.replace('[VISION_ERROR]: ', '')}\n已为您降级为[纯图]模式保存。`);
                                return { text: '[图识失效]', embed: `![[${fullVaultPath}]]` };
                            }
                            return { text: desc, embed: `![[${fullVaultPath}]]` };
                        }
                    } catch(e) { }
                    return { text: '[图片处理失败]', embed: '' };
                });
                processedContent = `[图识]: ${visionResult.text}`;
                mediaEmbed = visionResult.embed;
            }
        } else if (msg.text) {
            const urlMatch = msg.text.match(/https?:\/\/[^\s]+/);
            if (urlMatch) processedContent = await this.media.fetchWebpageContent(urlMatch[0]);
        }

        // --- 3. 消息路由 (Capturing) ---
        let s = this.activeSessions.get(sessionKey);
        if (!s) {
            const recent = await this.sessionManager.getRecentSessions(3);
            const subSs = recent.filter(rs => rs.hasSubstance);
            const matchId = await this.llm.compareContext(processedContent, subSs);
            
            if (matchId !== 'NEW') {
                const matched = subSs.find(rs => rs.sessionId === matchId);
                await this.sendMessage(msg.platform, msg.chatId, t('smartAwakenPrompt').replace('{{theme}}', matched?.theme || ''), {
                    reply_markup: { inline_keyboard: [[{ text: t('confirmYes'), callback_data: 'resume:' + matchId }, { text: t('confirmNo'), callback_data: 'start_new' }]] }
                });
                return;
            }
            s = await this.startNewSession(msg.platform, msg.chatId, false);
        }

        s.status = "CAPTURING";
        s.unprocessedCount = (s.unprocessedCount || 0) + 1;
        const ts = new Date().toISOString();
        const finalContent = mediaEmbed ? `${mediaEmbed}\n\n${processedContent}` : processedContent;
        s.fragments.push({ type: msg.media?.type || 'text', content: finalContent, timestamp: ts });
        s.history.push({ role: 'user', text: finalContent });
        
        await this.sessionManager.saveSession(s);
        this.resetTimers(msg.platform, msg.chatId);
        this.triggerInteraction(msg.platform, msg.chatId);
    }

    async startNewSession(platform: IMPlatform, chatId: string, notify: boolean = true) {
        const sid = moment().format('YYYYMMDDHHmmss');
        const session: SessionData = {
            sessionId: sid,
            chatId: parseInt(chatId),
            status: 'CAPTURING',
            theme: 'New Idea',
            obsidianPath: '',
            lastUpdate: new Date().toISOString(),
            fragments: [],
            history: [],
            unprocessedCount: 0,
            hasSubstance: false,
            originalPath: ''
        };
        const key = `${platform}:${chatId}`;
        this.activeSessions.set(key, session);
        // if (notify) await this.sendMessage(platform, chatId, t('newSessionStarted'));
        return session;
    }

    async triggerInteraction(platform: IMPlatform, chatId: string) {
        const key = `${platform}:${chatId}`;
        const s = this.activeSessions.get(key);
        if (!s || s.unprocessedCount === 0) return;
        s.unprocessedCount = 0; 

        const lastMsg = s.history.filter(h => h.role === 'user').pop()?.text || '';
        const historySum = s.history.slice(0, -1).map(h => h.role + ': ' + h.text).join('\n').substring(0, 500);
        
        try {
            const res = await this.withTyping(platform, chatId, async () => {
                const intent = await this.llm.getIntent(lastMsg, historySum);
                // 实质内容锁定逻辑：只有在【有意义】且【不是寒暄】时才标记
                if (intent.is_meaningful && intent.intent !== 'greeting') {
                    s.hasSubstance = true;
                    // 主题晋级制：一旦锁定高质量主题，禁止被后续的 New Idea 或客套话冲掉
                    if (intent.topic && intent.topic !== 'New Idea') {
                        s.theme = intent.topic;
                    }
                }
                let searchSum = '';
                if (intent.need_search && this.settings.search.current !== 'none') {
                    let finalQuery = intent.search_query || intent.topic;
                    if (intent.intent === 'idea') finalQuery = intent.topic + ' 行业背景 是否有人做过竞品';
                    else if (intent.intent === 'research') finalQuery = intent.topic + ' 最新进展 评测';
                    if (intent.intent !== 'bookmark') {
                        searchSum = await this.media.callSearch(finalQuery);
                        if (searchSum.startsWith('[SEARCH_ERROR]')) { new Notice(searchSum.replace('[SEARCH_ERROR]: ', '')); searchSum = ""; }
                    }
                }
                return await this.llm.callLLM(s, 'INTERACTION', searchSum, { topic: intent.topic, user_input: lastMsg });
            });
            await this.sendMessage(platform, chatId, res.content);
            s.history.push({ role: 'assistant', text: res.content });
            await this.sessionManager.saveSession(s);
            // 核心修复：AI 回复后也重置计时器，确保缓冲时间从最后一次对话开始计算
            this.resetTimers(platform, chatId);
        } catch (e) {
            if (e.message?.startsWith('FATAL_LLM_ERROR:')) await this.sendMessage(platform, chatId, `❌ ${e.message.replace('FATAL_LLM_ERROR:', '')}`);
        }
    }

    async flushBuffer(platform: IMPlatform, chatId: string) {
        const key = `${platform}:${chatId}`;
        const s = this.activeSessions.get(key);
        if (!s || s.fragments.length === 0) return;

        // 1. 归档守卫：如果没有标记过实质内容，或者标题依然是初始状态，直接销毁
        if (!s.hasSubstance || s.theme === 'New Idea') {
            this.activeSessions.delete(key);
            return;
        }

        new Notice(t('processing'));
        const historyContext = s.history.filter(h => h.role === 'user').map(h => h.text).join('\n').substring(0, 1000);
        try {
            const { intent, res } = await this.withTyping(platform, chatId, async () => {
                const intent = await this.llm.getIntent(historyContext, "");
                let searchData = "";
                if (intent.need_search && this.settings.search.current !== 'none') {
                    searchData = await this.media.callSearch(intent.search_query || intent.topic);
                    if (searchData.startsWith('[SEARCH_ERROR]')) { new Notice(searchData); searchData = ""; }
                }
                const res = await this.llm.callLLM(s, "ARCHIVE", searchData);
                return { intent, res };
            });

            // 2. 消除末尾偏见：只有当归档总结也认为有意义且不是寒暄时，才允许最后一次更新主题
            if (intent.is_meaningful && intent.intent !== 'greeting' && intent.topic !== 'New Idea') {
                s.theme = intent.topic;
            }

            const tagLine = res.content.split('\n').find(l => l.startsWith('TAGS:'));
            const tags = tagLine ? tagLine.replace('TAGS:', '').trim() : '[]';
            let cleanBody = res.content.replace(/TAGS:[\s\S]*$/, '').trim();
            
            // 3. 剥离 Markdown 代码块包裹 (防止 LLM 误加 ```markdown)
            if (cleanBody.startsWith("```markdown")) cleanBody = cleanBody.replace(/^```markdown\n?/, "");
            else if (cleanBody.startsWith("```")) cleanBody = cleanBody.replace(/^```\n?/, "");
            if (cleanBody.endsWith("```")) cleanBody = cleanBody.replace(/\n?```$/, "");
            cleanBody = cleanBody.trim();

            const fileName = "Idea-" + moment().format("YYYYMMDD") + "-" + s.theme.replace(/[\\/:*?"<>|]/g, "").substring(0, 50) + ".md";
            const path = this.settings.inboxFolder + "/" + fileName;
            await this.ensureFolderExists(this.settings.inboxFolder);
            const finalMD = NoteTemplates.generateIdeaNote({ title: s.theme, date: moment().format('YYYY-MM-DD HH:mm'), intent: intent.intent, tags: tags, body: cleanBody });
            const existFile = this.app.vault.getAbstractFileByPath(path);
            if (existFile instanceof TFile) await this.app.vault.modify(existFile, finalMD);
            else await this.app.vault.create(path, finalMD);
            await this.sessionManager.saveSession(s);
            await this.sendMessage(platform, chatId, `${t('archiveSuccess')}${fileName}`);
            this.activeSessions.delete(key);
        } catch(e) {
            if (e.message?.startsWith('FATAL_LLM_ERROR:')) await this.sendMessage(platform, chatId, `❌ ${e.message.replace('FATAL_LLM_ERROR:', '')}`);
            else new Notice("Archive Error: " + e.message);
        }
    }

    async downloadFile(url: string, ext: string, folderPath: string) {
        const name = `TG-${moment().format('x')}.${ext}`;
        const path = `${folderPath}/${name}`;
        await this.ensureFolderExists(folderPath);
        const res = await requestUrl({ url: url, method: 'GET' });
        await this.app.vault.createBinary(path, res.arrayBuffer);
        return name;
    }

    async ensureFolderExists(folderPath: string) {
        const adapter = this.app.vault.adapter;
        if (!await adapter.exists(folderPath)) await this.app.vault.createFolder(folderPath);
    }

    resetTimers(platform: IMPlatform, chatId: string) {
        const key = `${platform}:${chatId}`;
        if (this.archiveTimers.has(key)) clearTimeout(this.archiveTimers.get(key)!);
        this.archiveTimers.set(key, setTimeout(() => this.flushBuffer(platform, chatId), this.settings.bufferTime * 60000));
        if (this.interactionTimers.has(key)) clearTimeout(this.interactionTimers.get(key)!);
        this.interactionTimers.set(key, setTimeout(() => this.triggerInteraction(platform, chatId), 4000));
    }

    stop() {
        this.archiveTimers.forEach(t => clearTimeout(t));
        this.interactionTimers.forEach(t => clearTimeout(t));
        this.archiveTimers.clear();
        this.interactionTimers.clear();
        this.activeSessions.clear();
    }
}
