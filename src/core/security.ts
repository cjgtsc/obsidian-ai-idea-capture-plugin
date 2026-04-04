import * as nodePath from 'path';
import * as crypto from 'crypto';
import { App } from "obsidian";

export class SecurityManager {
    app: App;
    masterKey: Buffer;
    secretPath: string;

    constructor(app: App, manifestDir: string) {
        this.app = app;
        this.secretPath = nodePath.join(manifestDir, '.secret');
    }

    async init() {
        const adapter = this.app.vault.adapter;
        if (await adapter.exists(this.secretPath)) {
            this.masterKey = Buffer.from(await adapter.read(this.secretPath), 'hex');
        } else {
            this.masterKey = crypto.randomBytes(32);
            await adapter.write(this.secretPath, this.masterKey.toString('hex'));
        }
    }

    encrypt(text: string): string {
        if (!text || text.startsWith('enc:')) return text;
        const iv = crypto.randomBytes(16);
        const cipher = crypto.createCipheriv('aes-256-ctr', this.masterKey, iv);
        const encrypted = Buffer.concat([cipher.update(text), cipher.final()]);
        return 'enc:' + iv.toString('hex') + ':' + encrypted.toString('hex');
    }

    decrypt(hash: string): string {
        if (!hash || !hash.startsWith('enc:')) return hash;
        try {
            const parts = hash.split(':');
            const iv = Buffer.from(parts[1], 'hex');
            const encryptedText = Buffer.from(parts[2], 'hex');
            const decipher = crypto.createDecipheriv('aes-256-ctr', this.masterKey, iv);
            const decrypted = Buffer.concat([decipher.update(encryptedText), decipher.final()]);
            return decrypted.toString();
        } catch (e) {
            return hash;
        }
    }
}
