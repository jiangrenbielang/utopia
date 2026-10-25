import { subjectColor } from '@/lib/study/types';
import { cn } from '@/lib/utils';

/** 科目徽标：固定配色（开发文档第九节），明暗主题通用 */
export function SubjectBadge({ subject, className }: { subject: string; className?: string }) {
  const color = subjectColor(subject);
  return (
    <span
      className={cn('tag font-medium', className)}
      style={{ backgroundColor: `${color}1f`, color, border: `1px solid ${color}33` }}
    >
      {subject}
    </span>
  );
}

export function SubjectDot({ subject, className }: { subject: string; className?: string }) {
  return (
    <span
      className={cn('inline-block w-2 h-2 rounded-full shrink-0', className)}
      style={{ backgroundColor: subjectColor(subject) }}
      aria-hidden
    />
  );
}
