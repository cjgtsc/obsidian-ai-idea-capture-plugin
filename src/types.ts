import { moment } from "obsidian";
import providersData from './providers.json';

export const PROVIDERS = providersData;

export type IMPlatform = 'telegram' | 'discord';

export interface UnifiedMessage {
    platform: IMPlatform;
    chatId: string;
    userId: string;
    text?: string;
    media?: {
        type: 'image' | 'voice' | 'url';
        fileId?: string;
        url?: string;
    };
    raw: any;
}

export interface IMConfig {
    enabled: boolean;
    token: string;
    authorizedIds: string[];
}

export interface IntentResult {
    topic: string;
    intent: 'idea' | 'research' | 'bookmark' | 'memo' | 'greeting';
    keywords: string[];
    is_meaningful: boolean;
    need_search: boolean;
    search_query: string;
    reply_style: 'brief' | 'detailed';
}

/**
 * 统一的服务提供商配置结构 (存储于 data.json)
 * 只记录用户私有的凭证和选中的 ID
 */
export interface ServiceConfig {
    current: string;
    useLLM?: boolean; // 针对 stt, vision 是否复用 LLM 的 Key
    providers: Record<string, { 
        key: string; 
        url?: string;   // 仅当 current === 'custom' 时用户可填
        model?: string; // 仅当 current === 'custom' 或厂商支持多模型时用户可填
    }>;
}

export interface IdeaCaptureSettings {
    activePlatform: IMPlatform;
    im: Record<IMPlatform, IMConfig>;
    inboxFolder: string;
    attachmentFolder: string;
    bufferTime: number;
    language: string;
    debugMode: boolean;
    
    // AI 服务配置
    llm: ServiceConfig;
    stt: ServiceConfig;
    vision: ServiceConfig;
    search: ServiceConfig;

    // 兼容性保留字段（用于迁移）
    telegramToken?: string;
    authorizedChatIds?: number[];
    sessionRetention?: number; // v0.2.0 已废弃但保留字段以防万一
}

export const DEFAULT_SETTINGS: IdeaCaptureSettings = {
    activePlatform: 'telegram',
    im: {
        telegram: { enabled: true, token: "", authorizedIds: [] },
        discord: { enabled: false, token: "", authorizedIds: [] }
    },
    inboxFolder: "5.元信息筛选池/1.产品灵感",
    attachmentFolder: "Attachments/Telegram",
    bufferTime: 5,
    language: (window.localStorage.getItem('language') || 'zh').toLowerCase(),
    debugMode: false,
    llm: {
        current: 'minimax-cn',
        providers: {
            'minimax-cn': { key: '' },
            'minimax': { key: '' },
            'openai': { key: '' },
            'deepseek': { key: '' },
            'custom': { key: '', url: '', model: '' }
        }
    },
    stt: {
        current: 'openai-whisper', useLLM: false,
        providers: {
            'openai-whisper': { key: '' },
            'groq-whisper': { key: '' },
            'custom': { key: '', url: '', model: '' }
        }
    },
    vision: {
        current: 'openai', useLLM: false,
        providers: {
            'openai': { key: '' },
            'custom': { key: '', url: '', model: '' },
            'none': { key: '' }
        }
    },
    search: {
        current: 'tavily',
        providers: {
            'tavily':        { key: '' },
            'serper':        { key: '' },
            'custom-serper': { key: '', url: 'http://127.0.0.1:8002' },
            'custom-tavily': { key: '', url: '' },
            'none':          { key: '' }
        }
    }
};

export interface SessionData {
    sessionId: string;
    chatId: number;
    status: 'CAPTURING' | 'IDLE';
    theme: string;
    obsidianPath: string;
    lastUpdate: string;
    fragments: Array<{ type: string; content: string; timestamp: string }>;
    history: Array<{ role: string; text: string; timestamp: string }>;
    unprocessedCount: number;
    hasSubstance: boolean;
    originalPath: string;
}
