'use client';

import Link from 'next/link';

/** 全站统一页脚：学习入口 + 开源署名（LibreTV / AGPL-3.0） */
export function SiteFooter() {
  return (
    <footer className="border-t border-line py-4 mt-auto">
      <div className="max-w-6xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-faint">
        <p className="flex items-center gap-2">
          <span className="brand-gradient font-semibold">Utopia</span>
          <span>· 考研网课学习平台</span>
        </p>
        <p className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1">
          <Link href="/courses" className="hover:text-accent transition-colors">
            课程库
          </Link>
          <Link href="/resources" className="hover:text-accent transition-colors">
            资源库
          </Link>
          <Link href="/settings" className="hover:text-accent transition-colors">
            学习设置
          </Link>
          <a
            href="https://github.com/LibreSpark/LibreTV"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-accent transition-colors"
          >
            基于 LibreTV
          </a>
          <span>AGPL-3.0 License</span>
        </p>
      </div>
    </footer>
  );
}
