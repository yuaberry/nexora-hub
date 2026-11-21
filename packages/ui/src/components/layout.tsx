import type { ReactNode } from 'react';
import { appliedTheme, type AppliedTheme, type ThemeMode } from '../theme/tokens.js';

/**
 * Estrutura: barra lateral e alternador de tema animado.
 *
 * O alternador fica no **canto superior esquerdo** e percorre claro/escuro.
 * A animação vive no CSS (`--paper-motion`) e desaparece quando "reduzir
 * movimento" está activo — não há animação ignorando a preferência de
 * acessibilidade.
 */

export interface SidebarItem {
  readonly id: string;
  readonly label: string;
  /** Selo "Planeado" (módulos que ainda não existem). */
  readonly planned?: boolean;
}

export interface SidebarProps {
  readonly items: readonly SidebarItem[];
  readonly activeId: string;
  readonly onSelect: (id: string) => void;
  readonly title: string;
  readonly footer?: ReactNode;
  /** Texto do selo de planeado. */
  readonly plannedLabel: string;
}

export function Sidebar({
  items,
  activeId,
  onSelect,
  title,
  footer,
  plannedLabel,
}: SidebarProps): ReactNode {
  return (
    <nav className="nx-sidebar" aria-label={title}>
      <strong className="nx-title" style={{ fontSize: '1.1rem' }}>
        {title}
      </strong>
      <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 'var(--paper-space-1)' }}>
        {items.map((item) => (
          <li key={item.id}>
            <button
              type="button"
              className={`nx-sidebar__item${item.id === activeId ? ' nx-sidebar__item--active' : ''}`}
              aria-current={item.id === activeId ? 'page' : undefined}
              onClick={() => {
                onSelect(item.id);
              }}
            >
              <span>{item.label}</span>
              {item.planned === true ? <span className="nx-badge nx-badge--planned">{plannedLabel}</span> : null}
            </button>
          </li>
        ))}
      </ul>
      {footer === undefined ? null : <div style={{ marginTop: 'auto' }}>{footer}</div>}
    </nav>
  );
}

export interface ThemeSwitchProps {
  /** Tema aplicado agora (claro, escuro, OLED ou preto e branco). */
  readonly theme: AppliedTheme;
  /** Alterna entre claro e escuro. */
  readonly onToggle: () => void;
  /** Rótulo acessível ("Alternador de tema"). */
  readonly label: string;
  /** Texto do tema claro e do escuro (para o leitor de ecrã). */
  readonly lightLabel: string;
  readonly darkLabel: string;
}

/** Alternador animado — a posição do polegar segue o tema aplicado. */
export function ThemeSwitch({ theme, onToggle, label, lightLabel, darkLabel }: ThemeSwitchProps): ReactNode {
  // Os temas especiais (OLED, preto e branco) são escuros: o polegar
  // fica do lado escuro neles também.
  const isDark = theme !== 'light';
  return (
    <button
      type="button"
      className="nx-theme-switch"
      role="switch"
      aria-checked={isDark}
      aria-label={label}
      title={isDark ? darkLabel : lightLabel}
      onClick={onToggle}
    >
      <span className="nx-theme-switch__thumb" aria-hidden="true">
        {isDark ? '☾' : '☀'}
      </span>
    </button>
  );
}

/** Devolve o tema aplicado para uma preferência (helper fino para as apps). */
export function resolveAppliedTheme(
  mode: ThemeMode,
  prefersDark: boolean,
): AppliedTheme {
  return appliedTheme(mode, prefersDark);
}