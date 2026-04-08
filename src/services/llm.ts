import { IdeaCaptureSettings, SessionData, IntentResult } from "../types";
import { Prompts } from "../prompts";
import { t, getSupportedLanguages } from "../i18n";
import { LLMProviderFactory } from "./llm/factory";
import { moment } from "obsidian";

/**
 * 大语言模型核心服务 (业务分发层)
 * 现在它不再包含具体协议逻辑，而是通过工厂调用对应的 Provider
 */
export class LLMService {
    settings: IdeaCaptureSettings;
    decrypt: (hash: string) => string;

    constructor(settings: IdeaCaptureSettings, decryptFn: (hash: string) => string) {
        this.settings = settings;
        this.decrypt = decryptFn;
    }

    private getProvider() {
        return LLMProviderFactory.getProvider(this.settings, this.decrypt);
    }

    private getTargetLangName(): string {
        const langCode = this.settings.language || 'zh';
        return getSupportedLanguages().find(l => l.code === langCode)?.name || langCode;
    }

    async getIntent(input: string, history: string): Promise<IntentResult> {
        const lang = this.getTargetLangName();
        const sys = Prompts.getIntent(input, history, lang);
        return await this.getProvider().getIntent(input, history, sys);
    }

    async callLLM(session: SessionData, mode: "INTERACTION" | "ARCHIVE", searchData: string = "", imData?: {topic: string, user_input: string}) {
        const lang = this.getTargetLangName();
        const headers = { 
            insight: t('coreInsight'), 
            original: t('originalIdea'), 
            discovery: t('researchFindings'), 
            next: t('nextSteps'), 
            chat: t('fullChat') 
        };
        const terms = { idea: t('coreInsight'), research: t('researchFindings') };
        const userLabel = t('userRole') || 'Me';
        const botLabel = t('botRole') || 'Bot';
        
        const sys = mode === "INTERACTION" 
            ? Prompts.getInteraction({ 
                topic: imData?.topic || "", 
                search_summary: searchData, 
                user_input: imData?.user_input || "",
                lang: lang,
                terms: terms
              }) 
            : Prompts.getArchive(lang, headers);

        // 截断保护：保留尾部（最近的对话），防止小窗口模型溢出
        const MAX_CONV_LEN = 30000;
        const trimTail = (text: string) => text.length > MAX_CONV_LEN ? '...\n' + text.slice(-MAX_CONV_LEN) : text;

        let userContent: string;
        if (mode === "INTERACTION") {
            const raw = session.history.map(h => h.role + ": " + h.text).join("\n");
            userContent = "Conversation:\n" + trimTail(raw);
        } else {
            const raw = session.history
                .filter(h => !h.text.includes('<details>') && !h.text.includes('## ')) // 关键过滤：移除历史中的旧笔记内容
                .map(h => `(${moment(h.timestamp).format('HH:mm')} ${h.role === 'user' ? userLabel : botLabel}): ${h.text}`)
                .join('\n');
            userContent = `<conversation>\n${trimTail(raw)}\n</conversation>\n<sources>\n${searchData}\n</sources>`;
        }

        return await this.getProvider().chat(sys, userContent, 4096);
    }

    async compareContext(userText: string, recentSessions: SessionData[]): Promise<string | 'NEW'> {
        return await this.getProvider().compareContext(userText, recentSessions);
    }

    async testConnection(type: 'llm' | 'stt' | 'vision' | 'search', pid: string, conf: any): Promise<{success: boolean, message: string}> {
        if (type === 'llm') {
            return await this.getProvider().testConnection();
        }
        return { success: false, message: "仅支持 LLM 测试" };
    }
}
