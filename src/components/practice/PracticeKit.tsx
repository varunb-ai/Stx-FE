/**
 * PracticeKit — the primitive set every Live Practice surface is built from.
 *
 * The rule these enforce: structure comes from the panel/eyebrow/tile system,
 * and colour only ever means something (accent = the system, positive/caution/
 * critical = a judgement about the user's work, neural = adaptive AI). Nothing
 * here takes a free-form colour, so a screen cannot drift into decoration.
 *
 * Styles live in `src/styles/practice-system.css` under the `.px` scope.
 */

import { forwardRef, type ButtonHTMLAttributes, type ElementType, type HTMLAttributes, type ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { cx, toneColor, toneVar, type PxTone } from './tones';

const TONE_VAR: Record<PxTone, string> = {
  accent: toneVar('accent'),
  neural: toneVar('neural'),
  positive: toneVar('positive'),
  caution: toneVar('caution'),
  critical: toneVar('critical'),
  neutral: toneVar('neutral'),
};

/* ── Panel ─────────────────────────────────────────────────────────────── */

type PanelVariant = 'default' | 'raised' | 'flush' | 'inset';

interface PanelProps extends HTMLAttributes<HTMLDivElement> {
  variant?: PanelVariant;
  tone?: PxTone;
  brackets?: boolean;
  as?: ElementType;
}

const VARIANT_CLASS: Record<PanelVariant, string> = {
  default: '',
  raised: 'px-panel--raised',
  flush: 'px-panel--flush',
  inset: 'px-panel--inset',
};

const TONE_PANEL_CLASS: Partial<Record<PxTone, string>> = {
  accent: 'px-panel--accent',
  positive: 'px-panel--positive',
  caution: 'px-panel--caution',
  critical: 'px-panel--critical',
};

export const Panel = forwardRef<HTMLDivElement, PanelProps>(function Panel(
  { variant = 'default', tone, brackets, as, className, children, ...rest },
  ref,
) {
  const Tag = (as ?? 'div') as ElementType;
  return (
    <Tag
      ref={ref}
      className={cx('px-panel', VARIANT_CLASS[variant], tone && TONE_PANEL_CLASS[tone], brackets && 'px-brackets', className)}
      {...rest}
    >
      {children}
    </Tag>
  );
});

/** Header row: eyebrow + title on the left, anything you pass on the right. */
export function PanelHead({
  eyebrow,
  icon: Icon,
  title,
  description,
  tone = 'accent',
  actions,
  plain,
  className,
}: {
  eyebrow?: ReactNode;
  icon?: LucideIcon;
  title?: ReactNode;
  description?: ReactNode;
  tone?: PxTone;
  actions?: ReactNode;
  plain?: boolean;
  className?: string;
}) {
  return (
    <div className={cx('px-panel__head', plain && 'px-panel__head--plain', className)}>
      <div className="min-w-0">
        {eyebrow ? (
          <div className="px-eyebrow" style={toneColor(tone)}>
            {Icon ? <Icon className="w-3 h-3" aria-hidden /> : null}
            {eyebrow}
          </div>
        ) : null}
        {title ? <div className={cx('px-subtitle', eyebrow && 'mt-1.5')}>{title}</div> : null}
        {description ? <div className="px-note mt-1">{description}</div> : null}
      </div>
      {actions ? <div className="flex items-center gap-2 shrink-0">{actions}</div> : null}
    </div>
  );
}

export function PanelBody({ tight, className, children }: { tight?: boolean; className?: string; children: ReactNode }) {
  return <div className={cx('px-panel__body', tight && 'px-panel__body--tight', className)}>{children}</div>;
}

/** 1px hue-carrying hairline, replacing the old stack of gradient bars. */
export function Seam({ tone = 'accent', className }: { tone?: PxTone; className?: string }) {
  return <div className={cx('px-seam', className)} style={{ ['--px-seam-hue' as string]: TONE_VAR[tone] }} aria-hidden />;
}

/* ── Type ──────────────────────────────────────────────────────────────── */

export function Eyebrow({
  tone = 'neutral',
  icon: Icon,
  className,
  children,
}: {
  tone?: PxTone;
  icon?: LucideIcon;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={cx('px-eyebrow', className)} style={tone === 'neutral' ? undefined : toneColor(tone)}>
      {Icon ? <Icon className="w-3 h-3" aria-hidden /> : null}
      {children}
    </div>
  );
}

/* ── Chip ──────────────────────────────────────────────────────────────── */

const CHIP_TONE: Record<PxTone, string> = {
  accent: 'px-chip--accent',
  neural: 'px-chip--neural',
  positive: 'px-chip--positive',
  caution: 'px-chip--caution',
  critical: 'px-chip--critical',
  neutral: '',
};

export function Chip({
  tone = 'neutral',
  icon: Icon,
  mono,
  size,
  solid,
  className,
  children,
}: {
  tone?: PxTone;
  icon?: LucideIcon;
  mono?: boolean;
  size?: 'sm' | 'lg';
  solid?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <span
      className={cx(
        'px-chip',
        solid ? 'px-chip--solid' : CHIP_TONE[tone],
        mono && 'px-chip--mono',
        size === 'lg' && 'px-chip--lg',
        className,
      )}
    >
      {Icon ? <Icon className="w-3 h-3 shrink-0" aria-hidden /> : null}
      {children}
    </span>
  );
}

/** Status dot. `live` adds the outward ping used for genuinely live state. */
export function StatusDot({ tone = 'positive', live, className }: { tone?: PxTone; live?: boolean; className?: string }) {
  return <span className={cx('px-dot', live && 'px-dot--live', className)} style={toneColor(tone)} aria-hidden />;
}

/* ── Button ────────────────────────────────────────────────────────────── */

type BtnVariant = 'primary' | 'outline' | 'ghost' | 'danger';

interface PxButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: BtnVariant;
  size?: 'sm' | 'md' | 'lg';
  block?: boolean;
  iconOnly?: boolean;
}

export const PxButton = forwardRef<HTMLButtonElement, PxButtonProps>(function PxButton(
  { variant = 'outline', size = 'md', block, iconOnly, className, type, children, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type ?? 'button'}
      className={cx(
        'px-btn',
        `px-btn--${variant}`,
        size === 'sm' && 'px-btn--sm',
        size === 'lg' && 'px-btn--lg',
        block && 'px-btn--block',
        iconOnly && 'px-btn--icon',
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
});

/* ── Data display ──────────────────────────────────────────────────────── */

/** Responsive grid that avoids Tailwind's `grid-cols-*` classes, which the
 *  app binds global child animations to. */
export function Grid({
  cols = 1,
  sm,
  md,
  gap,
  className,
  children,
}: {
  cols?: number;
  sm?: number;
  md?: number;
  gap?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      className={cx('px-grid', className)}
      style={{
        ['--px-cols' as string]: cols,
        ...(sm ? { ['--px-cols-sm' as string]: sm } : {}),
        ...(md ? { ['--px-cols-md' as string]: md } : {}),
        ...(gap ? { ['--px-gap' as string]: gap } : {}),
      }}
    >
      {children}
    </div>
  );
}

export function StatTile({
  label,
  value,
  unit,
  foot,
  icon: Icon,
  tone = 'accent',
  className,
}: {
  label: ReactNode;
  value: ReactNode;
  unit?: ReactNode;
  foot?: ReactNode;
  icon?: LucideIcon;
  tone?: PxTone;
  className?: string;
}) {
  return (
    <div className={cx('px-tile', className)} style={{ ['--px-tile-hue' as string]: TONE_VAR[tone] }}>
      <div className="px-tile__label">
        {Icon ? <Icon className="w-3 h-3" style={toneColor(tone)} aria-hidden /> : null}
        {label}
      </div>
      <div className="px-tile__value">
        {value}
        {unit ? <span className="px-tile__unit">{unit}</span> : null}
      </div>
      {foot ? <div className="px-tile__foot">{foot}</div> : null}
    </div>
  );
}

export function Meter({ value, tone = 'accent', className }: { value: number; tone?: PxTone; className?: string }) {
  const pct = Math.max(0, Math.min(100, Number.isFinite(value) ? value : 0));
  return (
    <div className={cx('px-meter', className)} role="presentation">
      <div className="px-meter__fill" style={{ width: `${pct}%`, ['--px-meter-hue' as string]: TONE_VAR[tone] }} />
    </div>
  );
}

/** Labelled meter row — label left, mono value right, bar beneath. */
export function MeterRow({
  label,
  value,
  display,
  tone = 'accent',
}: {
  label: ReactNode;
  value: number;
  display?: ReactNode;
  tone?: PxTone;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-[0.8125rem] px-ink-2">{label}</span>
        <span className="px-num text-[0.8125rem] font-semibold px-ink">{display ?? `${Math.round(value)}%`}</span>
      </div>
      <Meter value={value} tone={tone} />
    </div>
  );
}

/** Segmented question progress. */
export function Ticks({ total, current, className }: { total: number; current: number; className?: string }) {
  const count = Math.max(1, Math.min(40, Math.floor(total) || 1));
  return (
    <div className={cx('px-ticks', className)} aria-hidden>
      {Array.from({ length: count }).map((_, i) => (
        <span
          key={i}
          className="px-ticks__tick"
          data-state={i + 1 < current ? 'done' : i + 1 === current ? 'current' : 'todo'}
        />
      ))}
    </div>
  );
}

/** Circular score readout. */
export function Dial({
  value,
  size = 148,
  stroke = 8,
  tone = 'accent',
  children,
}: {
  value: number;
  size?: number;
  stroke?: number;
  tone?: PxTone;
  children?: ReactNode;
}) {
  const pct = Math.max(0, Math.min(100, Number.isFinite(value) ? value : 0));
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const offset = c - (pct / 100) * c;

  return (
    <div className="px-dial" style={{ width: size, height: size, ['--px-dial-hue' as string]: TONE_VAR[tone] }}>
      <svg width={size} height={size} aria-hidden>
        <circle className="px-dial__track" cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke} />
        <circle
          className="px-dial__value"
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          strokeWidth={stroke}
          strokeDasharray={c}
          strokeDashoffset={offset}
          style={{ ['--px-dial-circumference' as string]: c }}
        />
      </svg>
      <div className="px-dial__readout">{children}</div>
    </div>
  );
}

/* ── Lists ─────────────────────────────────────────────────────────────── */

export function Rows({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cx('px-rows', className)}>{children}</div>;
}

export function Row({
  tone = 'accent',
  index,
  className,
  children,
}: {
  tone?: PxTone;
  index?: number;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={cx('px-row', className)} style={{ ['--px-row-hue' as string]: TONE_VAR[tone] }}>
      {typeof index === 'number' ? (
        <span className="px-row__index">{index}</span>
      ) : (
        <span className="px-row__marker" aria-hidden />
      )}
      <div className="min-w-0 flex-1 px-body px-body--tight">{children}</div>
    </div>
  );
}

/** Bulleted findings list — the single pattern for strengths / gaps / tips. */
export function FindingList({
  items,
  tone = 'accent',
  numbered,
  empty,
}: {
  items?: string[] | null;
  tone?: PxTone;
  numbered?: boolean;
  empty?: ReactNode;
}) {
  const list = Array.isArray(items) ? items.filter((i) => typeof i === 'string' && i.trim()) : [];
  if (list.length === 0) {
    return empty ? <p className="px-note">{empty}</p> : null;
  }
  return (
    <Rows>
      {list.map((item, idx) => (
        <Row key={`${idx}-${item.slice(0, 24)}`} tone={tone} index={numbered ? idx + 1 : undefined}>
          {item}
        </Row>
      ))}
    </Rows>
  );
}

/* ── Empty state ───────────────────────────────────────────────────────── */

export function EmptyState({
  icon: Icon,
  title,
  hint,
}: {
  icon?: LucideIcon;
  title: ReactNode;
  hint?: ReactNode;
}) {
  return (
    <div className="px-panel px-panel--inset flex flex-col items-center justify-center gap-2 py-12 text-center">
      {Icon ? <Icon className="w-6 h-6 px-ink-3 opacity-60" aria-hidden /> : null}
      <p className="px-subtitle">{title}</p>
      {hint ? <p className="px-note max-w-sm">{hint}</p> : null}
    </div>
  );
}

/* ── Section heading used between panels ───────────────────────────────── */

export function SectionLabel({
  children,
  tone = 'neutral',
  icon,
  actions,
}: {
  children: ReactNode;
  tone?: PxTone;
  icon?: LucideIcon;
  actions?: ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <Eyebrow tone={tone} icon={icon}>
        {children}
      </Eyebrow>
      {actions}
    </div>
  );
}
