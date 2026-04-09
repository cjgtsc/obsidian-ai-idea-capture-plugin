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

    // 调试模式：在 IM 中输出处理过程信息
    async sendDebug(platform: IMPlatform, chatId: string, step: string) {
        if (!this.settings.debugMode) return;
        await this.sendMessage(platform, chatId, `🔧 [DEBUG] ${step}`);
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
      try {
        if (!this.auth.isAuthorized(msg.platform, msg.userId)) {
            await this.sendMessage(msg.platform, msg.chatId, t('notAuthorized'));
            return;
        }

        const sessionKey = `${msg.platform}:${msg.chatId}`;

        // --- 1. 指令解析 (Commands) ---
        if (msg.text?.startsWith('/')) {
            const cmd = msg.text.trim().split(' ')[0].toLowerCase();
            
            // A. 调试模式指令
            if (cmd === '/debug') {
                this.settings.debugMode = !this.settings.debugMode;
                const status = this.settings.debugMode ? t('debugOn') : t('debugOff');
                await this.sendMessage(msg.platform, msg.chatId, t('debugToggleMsg').replace('{{status}}', status));
                return;
            }

            // B. 丢弃指令
            if (cmd === '/drop') {
                if (this.archiveTimers.has(sessionKey)) clearTimeout(this.archiveTimers.get(sessionKey)!);
                if (this.interactionTimers.has(sessionKey)) clearTimeout(this.interactionTimers.get(sessionKey)!);
                this.activeSessions.delete(sessionKey);
                await this.sendMessage(msg.platform, msg.chatId, t("dropSuccess"));
                return;
            }

            // C. 结束/新话题指令
            if (cmd === '/end' || cmd === '/new') {
                const s = this.activeSessions.get(sessionKey);
                if (s && s.fragments.length > 0) await this.flushBuffer(msg.platform, msg.chatId);
                else if (cmd === '/new') await this.startNewSession(msg.platform, msg.chatId, true);
                return;
            }

            // D. 恢复指令
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

            // E. 帮助指令
            if (cmd === '/help' || cmd === '/start') {
                const helpMsg = `<b>${t("helpHeader")}</b>\n\n` +
                    `${t("helpStep1")}\n` +
                    `${t("helpStep2").replace("{{time}}", String(this.settings.bufferTime))}\n\n` +
                    `<b>${t("helpCmdHeader")}</b>\n` +
                    `${t("helpCmdResume")}\n` +
                    `${t("helpCmdEnd")}\n` +
                    `${t("helpCmdNew")}\n` +
                    `${t("helpCmdDrop")}\n` +
                    `${t("helpCmdDebug")}`;
                await this.sendMessage(msg.platform, msg.chatId, helpMsg, { parse_mode: 'HTML' });
                return;
            }
        }

        // --- 2. 预处理多模态内容 ---
        const msgType = msg.media?.type || 'text';
        await this.sendDebug(msg.platform, msg.chatId, `📩 Message received [type: ${msgType}]${msg.text ? ' content: "' + msg.text.substring(0, 50) + '..."' : ''}`);

        let processedContent = msg.text || '';
        let mediaEmbed = '';

        if (msg.media?.type === 'voice') {
            await this.sendDebug(msg.platform, msg.chatId, `🎤 Voice received, downloading and transcribing...`);
            const provider = this.imProviders.get(msg.platform);
            let link = "";
            if ((msg.media.fileId ?? '').startsWith('http')) link = msg.media.fileId ?? '';
            else link = await (provider as any).getFileLink?.(msg.media.fileId ?? '');

            
            if (link) {
                processedContent = await this.withAction(msg.platform, msg.chatId, 'record_voice', async () => {
                    try {
                        const audioRes = await requestUrl({ url: link, method: 'GET' });
                        await this.sendDebug(msg.platform, msg.chatId, `🎤 Voice downloaded, calling STT [${this.settings.stt.current}]...`);
                        const txt = await this.media.transcribeVoice(audioRes.arrayBuffer);
                        if (txt.startsWith('[STT_ERROR]')) {
                            await this.sendDebug(msg.platform, msg.chatId, `❌ STT failed: ${txt}`);
                            await this.sendMessage(msg.platform, msg.chatId, t('sttFallbackNotice').replace('{{error}}', txt.replace('[STT_ERROR]: ', '')));
                            return '[STT_FALLBACK]';
                        }
                        await this.sendDebug(msg.platform, msg.chatId, `✅ STT success: "${txt.substring(0, 80)}..."`);
                        await this.sendMessage(msg.platform, msg.chatId, t('sttResult').replace('{{text}}', txt));
                        return '[voice]: ' + txt;
                    } catch(e) { return '[voice download failed]'; }
                });
            }
        } else if (msg.media?.type === 'image') {
            await this.sendDebug(msg.platform, msg.chatId, `🖼️ Image received, downloading and analyzing...`);
            const provider = this.imProviders.get(msg.platform);
            let link = "";
            if ((msg.media.fileId ?? '').startsWith('http')) link = msg.media.fileId ?? '';
            else link = await (provider as any).getFileLink?.(msg.media.fileId ?? '');

            if (link) {
                const visionResult = await this.withAction(msg.platform, msg.chatId, 'upload_photo', async () => {
                    const attachDir = this.settings.inboxFolder + "/Attachments";
                    try {
                        const fileName = await this.downloadFile(link, 'jpg', attachDir);
                        if (fileName) {
                            await this.sendDebug(msg.platform, msg.chatId, `🖼️ Image saved, calling Vision [${this.settings.vision.current}]...`);
                            const adapter = this.app.vault.adapter as any;
                            const absPath = nodePath.join(adapter.basePath, attachDir, fileName);
                            const desc = await this.media.callVision(absPath);
                            const fullVaultPath = `${this.settings.inboxFolder}/Attachments/${fileName}`;
                            if (desc.startsWith('[VISION_ERROR]')) {
                                await this.sendDebug(msg.platform, msg.chatId, `❌ Vision failed: ${desc}`);
                                await this.sendMessage(msg.platform, msg.chatId, t('visionFallbackNotice').replace('{{error}}', desc.replace('[VISION_ERROR]: ', '')));
                                return { text: '[VISION_FALLBACK]', embed: `![[${fullVaultPath}]]` };
                            }
                            await this.sendDebug(msg.platform, msg.chatId, `✅ Vision success: "${desc.substring(0, 80)}..."`);
                            return { text: desc, embed: `![[${fullVaultPath}]]` };
                        }
                    } catch(e) { }
                    return { text: '[image processing failed]', embed: '' };
                });
                processedContent = `[vision]: ${visionResult.text}`;
                mediaEmbed = visionResult.embed;
            }
        } else if (msg.text) {
            const urlMatch = msg.text.match(/https?:\/\/[^\s]+/);
            if (urlMatch) {
                await this.sendDebug(msg.platform, msg.chatId, `🔗 URL detected, fetching content...`);
                processedContent = await this.media.fetchWebpageContent(urlMatch[0]);
            }
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
        s.history.push({ role: 'user', text: finalContent, timestamp: ts });
        
        await this.sessionManager.saveSession(s);
        this.resetTimers(msg.platform, msg.chatId);
      } catch (e: any) {
        new Notice("Message Error: " + e.message);
        await this.sendMessage(msg.platform, msg.chatId, `❌ ${e.message}`).catch(() => {});
      }
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
                await this.sendDebug(platform, chatId, `🧠 Calling LLM [${this.settings.llm.current}] for intent analysis...`);
                const intent = await this.llm.getIntent(lastMsg, historySum);
                await this.sendDebug(platform, chatId, `🧠 Intent result: intent=${intent.intent} topic=${intent.topic} need_search=${intent.need_search} is_meaningful=${intent.is_meaningful} search_query=${intent.search_query || '(none)'}`);
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
                    if (intent.intent === 'idea') finalQuery = intent.topic + ' industry background competitors';
                    else if (intent.intent === 'research') finalQuery = intent.topic + ' latest progress review';
                    await this.sendDebug(platform, chatId, `🔍 Triggering search [${this.settings.search.current}], query: "${finalQuery}"`);
                    if (intent.intent !== 'bookmark') {
                        searchSum = await this.media.callSearch(finalQuery);
                        if (searchSum.startsWith('[SEARCH_ERROR]')) {
                            await this.sendDebug(platform, chatId, `❌ Search failed: ${searchSum}`);
                            new Notice(searchSum.replace('[SEARCH_ERROR]: ', ''));
                            await this.sendMessage(platform, chatId, t('searchUnavailable'));
                            searchSum = "";
                        } else if (searchSum.length === 0) {
                            await this.sendDebug(platform, chatId, `⚠️ Search returned empty result`);
                        } else {
                            await this.sendDebug(platform, chatId, `✅ Search success, length: ${searchSum.length} chars`);
                        }
                    }
                } else {
                    await this.sendDebug(platform, chatId, `ℹ️ Search skipped (need_search=${intent.need_search}, provider=${this.settings.search.current})`);
                }
                await this.sendDebug(platform, chatId, `💬 Calling LLM for reply (search data: ${searchSum.length} chars)...`);
                return await this.llm.callLLM(s, 'INTERACTION', searchSum, { topic: intent.topic, user_input: lastMsg });
            });
            await this.sendMessage(platform, chatId, res.content);
            s.history.push({ role: 'assistant', text: res.content, timestamp: new Date().toISOString() });
            await this.sessionManager.saveSession(s);
            // 核心修复：AI 回复后也重置计时器，确保缓冲时间从最后一次对话开始计算
            this.resetTimers(platform, chatId);
        } catch (e: any) {
            await this.sendDebug(platform, chatId, `❌ 处理异常: ${e.message}`);
            if (e.message?.startsWith('FATAL_LLM_ERROR:')) await this.sendMessage(platform, chatId, `❌ ${e.message.replace('FATAL_LLM_ERROR:', '')}`);
            else await this.sendMessage(platform, chatId, `❌ ${e.message}`).catch(() => {});
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
        await this.sendDebug(platform, chatId, `📦 Archiving (theme: ${s.theme})...`);
        // 清洗 historyContext：移除 Obsidian 嵌入语法与多模态前缀，减少 getIntent 噪音
        const historyContext = `Theme: ${s.theme}\n` + s.history
            .filter(h => h.role === 'user')
            .map(h => h.text
                .replace(/!\[\[.*?\]\]\n*/g, '')   // 移除 ![[embed]] 嵌入
                .replace(/^\[vision\]: /m, '')      // 剥离 vision 前缀
                .replace(/^\[voice\]: /m, '')       // 剥离 voice 前缀
                .trim()
            )
            .filter(t => t.length > 0)
            .join('\n')
            .substring(0, 1000);
        try {
            const { intent, res } = await this.withTyping(platform, chatId, async () => {
                await this.sendDebug(platform, chatId, `🧠 Analyzing archive intent...`);
                const intent = await this.llm.getIntent(historyContext, "");
                await this.sendDebug(platform, chatId, `🧠 Archive intent: intent=${intent.intent}, need_search=${intent.need_search}`);
                let searchData = "";
                if (intent.need_search && this.settings.search.current !== 'none') {
                    await this.sendDebug(platform, chatId, `🔍 Archive search [${this.settings.search.current}]: "${intent.search_query || intent.topic}"`);
                    searchData = await this.media.callSearch(intent.search_query || intent.topic);
                    if (searchData.startsWith('[SEARCH_ERROR]')) {
                        await this.sendDebug(platform, chatId, `❌ Archive search failed: ${searchData}`);
                        new Notice(searchData);
                        await this.sendMessage(platform, chatId, t('searchUnavailableArchive'));
                        searchData = "";
                    } else {
                        await this.sendDebug(platform, chatId, `✅ Archive search done, length: ${searchData.length}`);
                    }
                }
                await this.sendDebug(platform, chatId, `📝 Calling LLM to generate note...`);
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

            // 4. 图片嵌入注入：从 fragments 提取图片 embed，插入原始想法章节
            const imageEmbeds = s.fragments
                .filter(f => f.type === 'image')
                .map(f => {
                    const match = f.content.match(/!\[\[.*?\]\]/);
                    return match ? match[0] : '';
                })
                .filter(e => e.length > 0);
            if (imageEmbeds.length > 0) {
                const embedBlock = '\n\n' + imageEmbeds.join('\n\n');
                // 找到 "## 📥" 章节末尾（下一个 "## " 之前）插入图片
                const originalHeader = /^(## 📥[^\n]*\n)([\s\S]*?)(?=\n## )/m;
                const headerMatch = cleanBody.match(originalHeader);
                if (headerMatch) {
                    cleanBody = cleanBody.replace(originalHeader, headerMatch[1] + headerMatch[2] + embedBlock + '\n');
                } else {
                    // 兜底：如果没找到标准章节结构，在文末追加
                    cleanBody += embedBlock;
                }
            }

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
        } catch(e: any) {
            await this.sendDebug(platform, chatId, `❌ Archive error: ${e.message}`);
            if (e.message?.startsWith('FATAL_LLM_ERROR:')) await this.sendMessage(platform, chatId, `❌ ${e.message.replace('FATAL_LLM_ERROR:', '')}`);
            else {
                new Notice("Archive Error: " + e.message);
                await this.sendMessage(platform, chatId, `❌ ${e.message}`);
            }
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
