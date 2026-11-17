import type { ReactNode } from 'react';
import { storageBar, type StorageBarResult, type StorageSegmentTone } from '@nexora/core';

/**
 * Componentes de exibição.
 *
 * Todos consomem os tokens de papel — nenhum escreve cor própria. O selo
 * "Planeado" e a capa ausente são as duas peças que sustentam a honestidade
 * da interface: uma capacidade que não existe aparece como planeada, e uma
 * capa inexistente aparece como placeholder do tema (nunca uma imagem
 * inventada).
 */

export interface BadgeProps {
  readonly tone?: 'neutral' | 'planned' | 'positive' | 'danger';
  readonly children: ReactNode;
}

export function Badge({ tone = 'neutral', children }: BadgeProps): ReactNode {
  return <span className={`nx-badge nx-badge--${tone}`}>{children}</span>;
}

export interface PlannedBadgeProps {
  /** Texto do selo ("Planeado"). */
  readonly label: string;
}

/** Selo de capacidade planeada — a peça central da regra de honestidade. */
export function PlannedBadge({ label }: PlannedBadgeProps): ReactNode {
  return (
    <Badge tone="planned">
      <span aria-hidden="true">◇</span>
      {label}
    </Badge>
  );
}

export interface CardProps {
  readonly children: ReactNode;
  readonly raised?: boolean;
  readonly className?: string;
}

export function Card({ children, raised = false, className }: CardProps): ReactNode {
  return <section className={`nx-card${raised ? ' nx-card--raised' : ''} ${className ?? ''}`}>{children}</section>;
}

export interface EmptyStateProps {
  readonly title: string;
  readonly hint?: string;
  /** Acção opcional (um botão, uma ligação) — nunca um pedido de desculpas. */
  readonly children?: ReactNode;
}

/** Estado vazio explica o que falta e o que fazer — nunca uma tela muda. */
export function EmptyState({ title, hint, children }: EmptyStateProps): ReactNode {
  return (
    <div className="nx-empty">
      <strong>{title}</strong>
      {hint === undefined ? null : <span>{hint}</span>}
      {children}
    </div>
  );
}

/** Mensagem de módulo planeado (aviso, não botão fingido). */
export function PlannedNotice({ title, hint, badge }: PlannedNoticeProps): ReactNode {
  return (
    <div className="nx-banner">
      <PlannedBadge label={badge} />
      <span className="nx-stack">
        <strong>{title}</strong>
        {hint === undefined ? null : <span className="nx-subtitle">{hint}</span>}
      </span>
    </div>
  );
}

export interface PlannedNoticeProps {
  readonly title: string;
  readonly hint?: string;
  readonly badge: string;
}

export interface StorageBarProps {
  /** Bytes ocupados pelos jogos. */
  readonly used: number;
  /** Bytes ocupados por outro conteúdo. */
  readonly other: number;
  /** Capacidade total (0 = desconhecida). */
  readonly total: number;
  /** Rótulo acessível (ex.: "Armazenamento do disco"). */
  readonly label: string;
}

/**
 * Barra de armazenamento azul/cinza/amarelo.
 *
 * As proporções vêm de `storageBar` (`@nexora/core`): a barra desenha o que
 * a função pura calcula — incluindo o excesso de capacidade, que é declarado
 * em vez de silenciosamente aparado.
 */
export function StorageBarView({ used, other, total, label }: StorageBarProps): ReactNode {
  const bar: StorageBarResult = storageBar(used, other, total);
  const toneClass: Record<StorageSegmentTone, string> = {
    accent: 'nx-storage-bar__segment--accent',
    neutral: 'nx-storage-bar__segment--neutral',
    warning: 'nx-storage-bar__segment--warning',
  };
  return (
    <div
      className="nx-storage-bar"
      role="img"
      aria-label={label}
      data-over-capacity={bar.overCapacity}
    >
      {bar.segments.map((segment) => (
        <span
          key={segment.labelKey}
          className={`nx-storage-bar__segment ${toneClass[segment.tone]}`}
          style={{ width: `${(segment.ratio * 100).toFixed(2)}%` }}
          data-segment={segment.labelKey}
        />
      ))}
    </div>
  );
}