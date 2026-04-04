import { IMPlatform, IdeaCaptureSettings } from "../types";
import { EventEmitter } from "events";

/**
 * 准入控制服务 (AuthService)
 * 职责：管理激活码、设备授权、平台绑定逻辑、数据清洗
 */
export class AuthService extends EventEmitter {
    private settings: IdeaCaptureSettings;
    private saveSettings: () => Promise<void>;
    private currentActivationCode: string;

    constructor(settings: IdeaCaptureSettings, saveSettingsFn: () => Promise<void>) {
        super();
        this.settings = settings;
        this.saveSettings = saveSettingsFn;
        this.refreshActivationCode();
    }

    /**
     * 数据清洗与历史迁移
     * 将 main.ts 中的旧数据兼容逻辑迁移至此
     */
    async sanitizeData(): Promise<boolean> {
        let migrated = false;
        
        // 1. 处理 Telegram 历史字段迁移
        const tg = this.settings.im.telegram;
        
        // 兼容旧版单一 authorizedChatIds (number[])
        if ((this.settings as any).authorizedChatIds) {
            const oldIds: number[] = (this.settings as any).authorizedChatIds;
            const existingIds = new Set(tg.authorizedIds);
            oldIds.forEach(id => {
                const sId = id.toString();
                if (!existingIds.has(sId)) tg.authorizedIds.push(sId);
            });
            delete (this.settings as any).authorizedChatIds;
            migrated = true;
        }

        // 兼容旧版根目录 telegramToken
        if ((this.settings as any).telegramToken) {
            if (!tg.token) {
                tg.token = (this.settings as any).telegramToken;
            }
            delete (this.settings as any).telegramToken;
            migrated = true;
        }

        // 2. 强制类型转换 (确保所有 ID 均为 string)
        for (const platform in this.settings.im) {
            const config = this.settings.im[platform as IMPlatform];
            const originalCount = config.authorizedIds.length;
            config.authorizedIds = config.authorizedIds
                .map(id => String(id))
                .filter((id, index, self) => self.indexOf(id) === index); // 去重
            
            if (config.authorizedIds.length !== originalCount) migrated = true;
        }

        // 3. 强制单平台原则：如果发现多个平台有绑定，除 activePlatform 外全部清理 (可选，根据严苛程度决定)
        // 目前先保证逻辑正确，暂不暴力清理用户数据
        
        if (migrated) await this.saveSettings();
        return migrated;
    }

    /**
     * 校验并绑定设备
     */
    async validateAndBind(platform: IMPlatform, userId: string, code: string): Promise<{ success: boolean; messageKey: string }> {
        // 1. 激活码校验
        if (code !== this.currentActivationCode) {
            return { success: false, messageKey: "invalidCode" };
        }

        // 2. 单平台绑定校验：检查是否有其他平台已存在设备
        for (const p in this.settings.im) {
            if (p !== platform && this.settings.im[p as IMPlatform].authorizedIds.length > 0) {
                // 如果其他平台已有绑定，拒绝当前平台的绑定
                return { success: false, messageKey: "imBindingCheck" }; // 这里可能需要一个新的 i18n key 提示先解绑
            }
        }

        // 3. 执行绑定
        const config = this.settings.im[platform];
        const sUserId = String(userId);
        if (!config.authorizedIds.includes(sUserId)) {
            config.authorizedIds.push(sUserId);
            await this.saveSettings();
            this.emit("auth-changed", { type: "bind", platform, userId: sUserId });
            return { success: true, messageKey: "activationSuccess" };
        }

        return { success: true, messageKey: "activationSuccess" };
    }

    /**
     * 解除绑定
     */
    async unbind(platform: IMPlatform, userId: string): Promise<void> {
        const config = this.settings.im[platform];
        const sUserId = String(userId);
        const index = config.authorizedIds.indexOf(sUserId);
        
        if (index > -1) {
            // 先 emit，让外部有机会在权限还在时发送最后一条“解绑成功”的消息
            this.emit("auth-changed", { type: "unbind", platform, userId: sUserId });
            
            config.authorizedIds.splice(index, 1);
            await this.saveSettings();
        }
    }

    /**
     * 权限检查
     */
    isAuthorized(platform: IMPlatform, userId: string): boolean {
        return this.settings.im[platform].authorizedIds.includes(String(userId));
    }

    /**
     * 是否允许切换平台 (当前活跃平台已清空)
     */
    canSwitchPlatform(): boolean {
        const currentPlatform = this.settings.activePlatform;
        return this.settings.im[currentPlatform].authorizedIds.length === 0;
    }

    /**
     * 激活码管理
     */
    getActivationCode(): string {
        return this.currentActivationCode;
    }

    refreshActivationCode(): string {
        this.currentActivationCode = Math.floor(100000 + Math.random() * 900000).toString();
        return this.currentActivationCode;
    }
}
