export const NoteTemplates = {
    // 基础灵感笔记模板
    // 职责：仅负责 Frontmatter 结构和正文包裹。对话历史已由 AI 动态生成并包含在 body 中。
    generateIdeaNote: (data: {
        title: string;
        date: string;
        intent: string;
        tags: string;
        body: string;
    }) => `---
title: "${data.title}"
date: ${data.date}
source: telegram-bot
intent: ${data.intent}
tags: ${data.tags}
status: inbox
---

${data.body}`
};
