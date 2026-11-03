'use client';

import { useState } from 'react';
import { Icon } from '@/components/icon';
import { useToast } from '@/components/toast';
import { useTvboxExtras } from '@/components/tvbox-wallpaper';
import { api } from '@/lib/client-api';
import type { TvboxParse } from '@/lib/tvbox-config';

/**
 * 「解析线路」快捷行。
 *
 * TVBOX 配置里的 `parses[]` 是「拿播放页地址换真实播放地址」的解析服务。这里只列出
 * **真正可请求**的线路：内置关键字（`Parallel` / `Sequence` / `Web` / `Demo`）是
 * TVBOX 客户端自带的聚合解析器，不是地址，本客户端跑不了，已在解析层标记为 `builtin`。
 *
 * 结果按「能不能解析」分三种反馈，**都不当成错误**：
 * - 拿到地址 → 交给 `onResolved` 切过去，并提示来自哪条线路；
 * - 返回播放页（`needs-browser`）→ 说明该线路是浏览器嗅探类，本客户端不具备该能力；
 * - 没给出地址（`no-url` / `empty`）→ 如实转达上游给的原因。
 *
 * 这样用户看到的是「这条线路为什么不适用」，而不是一句无差别的「解析失败」。
 */
export default function ParseLines({
  target,
  onResolved,
}: {
  /** 待解析的播放页地址（当前播放地址） */
  target: string;
  /** 解析成功后的回调：把播放器切到新地址 */
  onResolved: (url: string) => void;
}) {
  const extras = useTvboxExtras();
  const { toast } = useToast();
  const [busy, setBusy] = useState<string | null>(null);

  const lines = (extras?.parses ?? []).filter(
    (line) => !line.builtin && /^https?:\/\//i.test(line.url)
  );
  if (!target || lines.length === 0) return null;

  async function run(line: TvboxParse): Promise<void> {
    setBusy(line.name);
    try {
      const result = await api.parse(line.url, target);
      if (result.ok) {
        onResolved(result.url);
        toast(`「${line.name}」解析成功，已切换到它给出的地址`, 'success');
        return;
      }
      // 三类「没解析出来」都是可预期结果，措辞上区分「本客户端跑不了」与「线路没给地址」
      toast(result.message, result.kind === 'needs-browser' ? 'warning' : 'info');
    } catch (error) {
      toast(error instanceof Error ? error.message : '解析请求失败', 'error');
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="flex items-center gap-1.5 min-w-0 overflow-x-auto scroll-hidden">
      <span className="flex items-center gap-1 text-xs text-faint shrink-0">
        <Icon name="bolt" className="w-3.5 h-3.5" />
        解析线路
      </span>
      {lines.map((line) => (
        <button
          key={`${line.name}-${line.url}`}
          className="chip bg-chip text-muted hover:bg-hover shrink-0 focus-ring whitespace-nowrap"
          disabled={busy !== null}
          onClick={() => void run(line)}
          title={
            line.flag && line.flag.length > 0
              ? `${line.url}\n（配置限定：仅在这些线路名下使用 —— ${line.flag.join('、')}）`
              : line.url
          }
        >
          {busy === line.name ? '解析中…' : line.name}
          {line.type === 4 && <span className="text-faint">·超级解析</span>}
        </button>
      ))}
    </div>
  );
}