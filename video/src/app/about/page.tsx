'use client';

import Link from 'next/link';
import { PageShell } from '@/components/study/page-shell';
import { SUBJECTS } from '@/lib/study/types';

export default function AboutPage() {
  return (
    <PageShell className="max-w-3xl">
      <h1 className="text-2xl font-bold text-content">关于 Utopia</h1>
      <p className="text-sm text-muted leading-relaxed mt-2">
        Utopia 是一个面向考研备考的本地网课学习平台：按科目组织课程、观看网课时自动记录学习时长，
        并提供考试倒计时、日/周/月统计与历史日志。界面与交互沿用 LibreTV 的深色赛博风格。
      </p>

      <section className="card p-5 mt-5">
        <h2 className="text-sm font-medium text-content mb-2">怎么用</h2>
        <ol className="text-sm text-muted space-y-1.5 list-decimal list-inside leading-relaxed">
          <li>首页设置考研目标日期，倒计时会自动更新。</li>
          <li>课程库挑一门课（可新建 / 编辑课程，章节填入 m3u8 或 mp4 直链），点「开始学习」播放。</li>
          <li>播放时页面自动累计学习时长，满 1 分钟后可结束并填写本次学习内容；离开页面也会自动保存。</li>
          <li>不在电脑前学习时，用「计时」页选科目手动计时，规则一致。</li>
          <li>忘记计时可在「日志」页补录；统计页按日 / 周 / 月查看各科占比。</li>
          <li>资源库可聚合搜索第三方点播源里的网课视频，播放时同样计时。</li>
        </ol>
      </section>

      <section className="card p-5 mt-5">
        <h2 className="text-sm font-medium text-content mb-2">学习时长口径</h2>
        <ul className="text-sm text-muted space-y-1.5 list-disc list-inside leading-relaxed">
          <li>时长按 1 分钟向上取整：1 分 30 秒记为 2 分钟。</li>
          <li>不足 1 分钟不保存，避免误触产生碎记录。</li>
          <li>暂停、离开播放页不计时；快进/拖进度条不刷时长。</li>
          <li>跨零点学习归属开始那天。</li>
          <li>累计指标统计全部记录；日均 = 周期总时长 ÷ 周期内已过天数。</li>
        </ul>
      </section>

      <section className="card p-5 mt-5">
        <h2 className="text-sm font-medium text-content mb-2">科目</h2>
        <div className="flex flex-wrap gap-1.5">
          {SUBJECTS.map((s) => (
            <span key={s} className="tag bg-chip text-muted border border-line">
              {s}
            </span>
          ))}
        </div>
      </section>

      <section className="card p-5 mt-5">
        <h2 className="text-sm font-medium text-content mb-2">数据与隐私</h2>
        <p className="text-sm text-muted leading-relaxed">
          学习记录、课程库与考试日期全部保存在当前浏览器的 localStorage 中，不上传服务器，也不需要账号。
          清除浏览器数据会导致记录丢失，建议在「学习设置」里定期导出 JSON 备份。资源库的聚合搜索请求由服务端代理转发。
        </p>
        <p className="text-xs text-faint mt-3">
          备份格式与《Utopia 开发文档 v1.1》第七节一致，可迁移到后续原生 App。
        </p>
      </section>

      <section className="card p-5 mt-5">
        <h2 className="text-sm font-medium text-content mb-2">开源与免责</h2>
        <p className="text-sm text-muted leading-relaxed">
          本项目基于{' '}
          <a
            href="https://github.com/LibreSpark/LibreTV"
            target="_blank"
            rel="noopener noreferrer"
            className="text-accent hover:underline"
          >
            LibreTV
          </a>{' '}
          构建，遵循 AGPL-3.0 License。Utopia 不存储、不制作任何视频内容；课程视频与资源库内容均来自你自行配置的第三方地址，
          请尊重版权并确保拥有相应学习权限。
        </p>
      </section>

      <p className="text-xs text-faint mt-5">
        返回 <Link href="/" className="text-accent hover:underline">首页</Link> 或{' '}
        <Link href="/settings" className="text-accent hover:underline">学习设置</Link>。
      </p>
    </PageShell>
  );
}
