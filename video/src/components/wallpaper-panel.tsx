'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Icon } from './icon';
import { useToast } from './toast';
import { useAppStore } from '@/lib/store';
import type { WallpaperAsset } from '@/lib/db';
import {
  WALLPAPER_ACCEPT,
  addWallpaper,
  clampWallpaperDim,
  listWallpapers,
  removeWallpaper,
} from '@/lib/wallpapers';

/**
 * 页面背景壁纸设置。
 *
 * 三种来源：「跟随 TVBOX 配置」/「我的图片」/「关闭」，加一个压暗程度滑块。
 * 本地图片存 IndexedDB（见 lib/wallpapers.ts），只在导入时读一次磁盘，
 * 缩略图用 object URL 现算——切换/删除/卸载都会立刻回收，不会把图片留在内存里。
 */
export default function WallpaperPanel() {
  const { toast } = useToast();
  const mode = useAppStore((s) => s.wallpaperMode);
  const dim = useAppStore((s) => s.wallpaperDim);
  const localId = useAppStore((s) => s.wallpaperLocalId);
  const fit = useAppStore((s) => s.wallpaperFit);
  const updateSettings = useAppStore((s) => s.updateSettings);

  const [assets, setAssets] = useState<WallpaperAsset[]>([]);
  const [thumbs, setThumbs] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const fileRef = useRef<HTMLInputElement>(null);

  const reload = useCallback(async () => {
    try {
      setAssets(await listWallpapers());
    } catch {
      // IndexedDB 不可用（隐私模式等）时按「没有本地壁纸」处理
      setAssets([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  // 缩略图 object URL：随 assets 变化重建，卸载/替换时回收
  useEffect(() => {
    const created: Record<string, string> = {};
    for (const asset of assets) {
      try {
        created[asset.id] = URL.createObjectURL(asset.blob);
      } catch {
        // 个别图片损坏时跳过，不影响其余
      }
    }
    setThumbs(created);
    return () => {
      Object.values(created).forEach((url) => {
        try {
          URL.revokeObjectURL(url);
        } catch {
          /* 忽略 */
        }
      });
    };
  }, [assets]);

  const pick = () => fileRef.current?.click();

  const onFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setBusy(true);
    const added: WallpaperAsset[] = [];
    const problems: string[] = [];
    for (const file of Array.from(files)) {
      try {
        added.push(await addWallpaper(file));
      } catch (err) {
        problems.push(err instanceof Error ? err.message : String(err));
      }
    }
    if (added.length > 0) {
      // 导入即启用：切到「我的图片」并选中最新一张，少点一步
      updateSettings({ wallpaperMode: 'local', wallpaperLocalId: added[0].id });
      toast(`已导入 ${added.length} 张图片并设为壁纸`, 'success');
      await reload();
    }
    if (problems.length > 0) toast(problems[0], 'error');
    setBusy(false);
    if (fileRef.current) fileRef.current.value = '';
  };

  const use = (asset: WallpaperAsset) => {
    updateSettings({ wallpaperMode: 'local', wallpaperLocalId: asset.id });
    toast(`已设为背景：${asset.name}`, 'success');
  };

  const remove = async (asset: WallpaperAsset) => {
    setBusy(true);
    try {
      await removeWallpaper(asset.id);
      const rest = await listWallpapers();
      setAssets(rest);
      if (localId === asset.id) {
        // 删掉的正是当前壁纸：退到剩下的第一张，没有就回落 TVBOX 配置
        if (rest.length > 0) updateSettings({ wallpaperLocalId: rest[0].id });
        else updateSettings({ wallpaperMode: 'tvbox', wallpaperLocalId: undefined });
      }
      toast(`已删除 ${asset.name}`, 'info');
    } catch (err) {
      toast(err instanceof Error ? err.message : '删除失败', 'error');
    } finally {
      setBusy(false);
    }
  };

  const modes: { key: typeof mode; label: string; hint: string }[] = [
    { key: 'tvbox', label: '跟随 TVBOX 配置', hint: '配置里的 wallpaper' },
    { key: 'local', label: '我的图片', hint: '本机导入' },
    { key: 'off', label: '关闭', hint: '只留页面底色' },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {modes.map((item) => {
          const active = mode === item.key;
          return (
            <button
              key={item.key}
              type="button"
              onClick={() => updateSettings({ wallpaperMode: item.key })}
              className={`rounded-md border px-3 py-2 text-left text-xs transition-colors ${
                active
                  ? 'border-accent bg-accent/10 text-content'
                  : 'border-line bg-surface text-muted hover:border-accent/50 hover:text-content'
              }`}
              aria-pressed={active}
            >
              <span className="block font-medium">{item.label}</span>
              <span className="block text-[10px] text-faint mt-0.5">{item.hint}</span>
            </button>
          );
        })}
      </div>

      <div>
        <label className="flex items-center justify-between text-xs text-muted" htmlFor="wallpaper-dim">
          <span>压暗程度</span>
          <span className="text-faint font-mono">{clampWallpaperDim(dim)}</span>
        </label>
        <input
          id="wallpaper-dim"
          type="range"
          min={0}
          max={95}
          step={1}
          value={clampWallpaperDim(dim)}
          onChange={(evt) => updateSettings({ wallpaperDim: clampWallpaperDim(evt.target.value) })}
          className="mt-2 w-full accent-accent"
          disabled={mode === 'off'}
        />
        <p className="text-[10px] text-faint mt-1">
          调高更易读、调低更「有壁纸感」；关掉壁纸时此项不生效。
        </p>
      </div>

      <div>
        <span className="text-xs text-muted">显示方式</span>
        <div className="mt-2 flex flex-wrap gap-2">
          {(
            [
              { key: 'cover', label: '铺满（裁切）', hint: '整屏都是图，边缘可能被裁掉' },
              { key: 'contain', label: '完整（留边）', hint: '看到整张图，可能留出页面底色' },
            ] as const
          ).map((item) => {
            const active = fit === item.key;
            return (
              <button
                key={item.key}
                type="button"
                onClick={() => updateSettings({ wallpaperFit: item.key })}
                disabled={mode === 'off'}
                aria-pressed={active}
                className={`rounded-md border px-3 py-1.5 text-left text-xs transition-colors ${
                  active
                    ? 'border-accent bg-accent/10 text-content'
                    : 'border-line bg-surface text-muted hover:border-accent/50 hover:text-content'
                }`}
              >
                <span className="block font-medium">{item.label}</span>
                <span className="block text-[10px] text-faint mt-0.5">{item.hint}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div>
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted">我的图片</span>
          <div className="flex items-center gap-2">
            <input
              ref={fileRef}
              type="file"
              accept={WALLPAPER_ACCEPT}
              multiple
              className="hidden"
              onChange={(evt) => void onFiles(evt.target.files)}
            />
            <button className="btn-ghost btn-sm" type="button" onClick={pick} disabled={busy}>
              <Icon name="plus" className="w-3.5 h-3.5" />
              导入本地图片
            </button>
          </div>
        </div>

        {loading ? (
          <p className="text-[11px] text-faint mt-2">正在读取…</p>
        ) : assets.length === 0 ? (
          <p className="text-[11px] text-faint mt-2">
            还没有导入图片。支持 png / jpg / webp 等，单张上限 12 MB；图片只保存在本机浏览器存储里。
          </p>
        ) : (
          <ul className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
            {assets.map((asset) => {
              const active = mode === 'local' && localId === asset.id;
              return (
                <li
                  key={asset.id}
                  className={`overflow-hidden rounded-md border ${active ? 'border-accent' : 'border-line'}`}
                >
                  <div
                    className="relative h-20 bg-chip bg-cover bg-center"
                    style={thumbs[asset.id] ? { backgroundImage: `url(${thumbs[asset.id]})` } : undefined}
                  >
                    {active && (
                      <span className="absolute left-1 top-1 rounded bg-accent px-1 py-0.5 text-[9px] font-medium text-white">
                        使用中
                      </span>
                    )}
                  </div>
                  <div className="flex items-center justify-between gap-1 px-1.5 py-1.5">
                    <span className="min-w-0 flex-1 truncate text-[10px] text-muted" title={asset.name}>
                      {asset.name}
                    </span>
                    {active ? (
                      <button
                        className="text-[10px] text-faint hover:text-danger"
                        type="button"
                        onClick={() => void remove(asset)}
                        disabled={busy}
                      >
                        删除
                      </button>
                    ) : (
                      <>
                        <button
                          className="text-[10px] text-accent hover:underline"
                          type="button"
                          onClick={() => use(asset)}
                          disabled={busy}
                        >
                          使用
                        </button>
                        <button
                          className="text-[10px] text-faint hover:text-danger"
                          type="button"
                          onClick={() => void remove(asset)}
                          disabled={busy}
                        >
                          删除
                        </button>
                      </>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}