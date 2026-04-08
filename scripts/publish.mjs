import { execSync } from 'child_process';
import fs from 'fs-extra';
import path from 'path';

/**
 * 自动化发布脚本：实现本地开发库与 GitHub 公开库的物理隔离
 * 策略：方案 C (双仓库策略) - 手动打标版
 */

const REMOTE_URL = 'https://github.com/cjgtsc/obsidian-ai-idea-capture-plugin.git';
const PUBLISH_DIR = path.join(process.cwd(), '.publish_temp');

async function publish() {
    console.log('🚀 启动 GitHub 发布流 (代码同步)...');

    try {
        const isFull = process.argv.includes('--full');
        const msgArgs = process.argv.slice(2).filter(a => a !== '--full');
        const commitMsg = msgArgs[0] || (isFull ? "chore: release (Full)" : "chore: 同步最新本地修改");

        if (fs.existsSync(PUBLISH_DIR)) fs.removeSync(PUBLISH_DIR);
        fs.ensureDirSync(PUBLISH_DIR);

        if (isFull) {
            console.log('⚠️ 检测到 --full 参数，正在启动全量覆写发版（将抹除 GitHub 老历史）...');
            execSync('git init', { cwd: PUBLISH_DIR });
            try { execSync('git checkout -b main', { cwd: PUBLISH_DIR }); } catch(e) {}
        } else {
            console.log('🔄 正在拉取远端仓库以保持历史记录 (增量模式)...');
            execSync(`git clone ${REMOTE_URL} .`, { cwd: PUBLISH_DIR });

            // 清空克隆下来的除 .git 之外的所有文件
            const files = fs.readdirSync(PUBLISH_DIR);
            for (const file of files) {
                if (file !== '.git') {
                    fs.removeSync(path.join(PUBLISH_DIR, file));
                }
            }
        }

        // 设置虚拟身份，防止读取本地系统真实姓名
        execSync('git config user.name "cjgtsc"', { cwd: PUBLISH_DIR });
        execSync('git config user.email "cjgtsc@users.noreply.github.com"', { cwd: PUBLISH_DIR });

        const includeList = [
            'src', 'scripts', '.github', '.gitignore', 'main.ts', 'manifest.json',
            'package.json', 'pnpm-lock.yaml', 'tsconfig.json', 'README.md', 'LICENSE', 'versions.json',
            'styles.css'
        ];

        for (const item of includeList) {
            const srcPath = path.join(process.cwd(), item);
            if (fs.existsSync(srcPath)) {
                fs.copySync(srcPath, path.join(PUBLISH_DIR, item));
            }
        }

        execSync('git add .', { cwd: PUBLISH_DIR });
        
        try {
            execSync(`git commit -m "${commitMsg}"`, { cwd: PUBLISH_DIR });
        } catch (commitErr) {
            console.log('ℹ️ 代码没有变更，无需发布。');
            return;
        }

        if (isFull) {
            console.log('📤 正在强制推送全量源码到 GitHub...');
            execSync(`git remote add origin ${REMOTE_URL}`, { cwd: PUBLISH_DIR });
            execSync('git push -f origin main', { cwd: PUBLISH_DIR, stdio: 'inherit' });
            execSync('git push -f --tags origin main', { cwd: PUBLISH_DIR, stdio: 'inherit' });
        } else {
            console.log('📤 正在正常增量推送源码到 GitHub...');
            execSync('git push origin main', { cwd: PUBLISH_DIR, stdio: 'inherit' });
            execSync('git push --tags origin main', { cwd: PUBLISH_DIR, stdio: 'inherit' });
        }

        console.log('✨ 源码同步成功！现在您可以去 GitHub 网页端手动发布 Release 了。');

    } catch (error) {
        console.error('❌ 同步失败:', error.message);
        process.exit(1);
    }
}

publish();
