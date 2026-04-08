# GitHub 发布工作流指南

这里是如何使用 `node scripts/publish.mjs` 将代码公开发布到 GitHub （并触发自动化流水线）的详细说明。

## 1. 增量发布（推荐日常使用）

脚本默认采用【增量发布模式】。它会保留 GitHub 上的旧历史，只会提交相比上次有变动的部分。

**使用示例：**
```bash
node scripts/publish.mjs "feat: 添加了自定义 STT 选择面板"
```

如果没有带参数直接输，它默认的提交说明是："chore: 同步最新本地修改"

## 2. 全量发布（覆盖远端库）

当你想 **强行抹除并替换掉 GitHub 上已有的老历史**，比如：清理早期带偏的代码碎片、亦或者（最重要的是）**彻底抹掉老历史中泄露的真实姓名** 时，你可以带上 `--full` 参数。

全量发布将会把目前 `includeList` 里的最新文件打包成一个全新的、仅有单条记录的代码库，并采用暴力手法（git push -f）强行替换你在云端的项目。

**使用示例：**
```bash
node scripts/publish.mjs "chore: 彻底重建代码库，清理信息" --full
```

## 注意事项与身份保护

所有通过此脚本产生的操作，系统都会强制切断与本地电脑环境的联系。
它必定会带有以下署名推送给 GitHub，这保证了你绝不会由于误操作而在这份源码的提交中泄露本人的真实名称 `xiongsong`：
- Username: `cjgtsc`
- E-Mail: `cjgtsc@users.noreply.github.com`
