import type { ReactNode } from "react";

/**
 * Card / CardHeader / CardBody
 *
 * Ports `.card`, `.cardH`, `.sm` and `.cardB` from the production design
 * system: a white 22px-radius surface with a ruled header row and a
 * 18px/20px padded body. Tables and full-bleed lists are placed directly
 * inside <Card> without a <CardBody>, exactly as in the reference markup.
 */

export type CardProps = {
  children?: ReactNode;
  className?: string;
  id?: string;
};

export function Card({ children, className, id }: CardProps) {
  return (
    <div
      id={id}
      className={`bg-white rounded-card overflow-hidden${className ? ` ${className}` : ""}`}
    >
      {children}
    </div>
  );
}

export type CardHeaderProps = {
  /** Rendered as the 14px/800 heading. Ignored when `children` is supplied. */
  title?: ReactNode;
  /** Rendered as the 11.5px muted `.sm` line under the title. */
  subtitle?: ReactNode;
  /** Right-hand slot: buttons, tags, pills. */
  actions?: ReactNode;
  /** Replaces the whole left-hand title block. */
  children?: ReactNode;
  className?: string;
};

export function CardHeader({
  title,
  subtitle,
  actions,
  children,
  className,
}: CardHeaderProps) {
  return (
    <div
      className={`flex items-center justify-between gap-[14px] px-[20px] py-[14px] border-b border-rule${
        className ? ` ${className}` : ""
      }`}
    >
      {children ?? (
        <div>
          {title === undefined ? null : (
            <h3 className="text-[14px] font-extrabold tracking-[-0.01em] text-ink">
              {title}
            </h3>
          )}
          {subtitle === undefined ? null : (
            <div className="text-[11.5px] text-mute font-semibold mt-[2px]">
              {subtitle}
            </div>
          )}
        </div>
      )}
      {actions === undefined ? null : (
        <div className="flex items-center gap-[8px] shrink-0">{actions}</div>
      )}
    </div>
  );
}

export type CardBodyProps = {
  children?: ReactNode;
  className?: string;
  /** Drop the 18px/20px padding (for full-bleed tables and ruled lists). */
  flush?: boolean;
};

export function CardBody({ children, className, flush = false }: CardBodyProps) {
  return (
    <div
      className={`${flush ? "" : "px-[20px] py-[18px]"}${className ? ` ${className}` : ""}`}
    >
      {children}
    </div>
  );
}
