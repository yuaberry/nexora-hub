import type { ReactNode } from 'react';
import { NavLink } from 'react-router-dom';
import { LOCALE_OPTIONS, Select, ThemeSwitch, useInterface } from '@nexora/ui';

/**
 * Estrutura da web — cabeçalho com marca, tema e idioma.
 *
 * O tema e o idioma são preferências **do dispositivo** (`localStorage`), não
 * da conta: respondem ao ecrã de quem o usa. O alternador animado fica no
 * canto superior esquerdo, como no desktop.
 */
export function AppShell({ children }: { readonly children: ReactNode }): ReactNode {
  const { t, locale, setLocale, appliedTheme, toggleTheme, scale, setScale } = useInterface();

  return (
    <div className="hub-shell">
      <header
        className="nx-row nx-row--between"
        style={{
          gridColumn: '1 / -1',
          padding: '0.75rem 1.25rem',
          borderBottom: '1px solid var(--paper-line)',
          background: 'var(--paper-surface)',
        }}
      >
        <div className="nx-row">
          <ThemeSwitch
            theme={appliedTheme}
            onToggle={toggleTheme}
            label={t('settings.theme.label')}
            lightLabel={t('settings.theme.light')}
            darkLabel={t('settings.theme.dark')}
          />
          <strong className="hub-break">{t('common.app.name')}</strong>
          <nav className="nx-row" aria-label={t('nav.library')}>
            <NavLink className="nx-sidebar__item" to="/biblioteca">
              {t('nav.library')}
            </NavLink>
            <NavLink className="nx-sidebar__item" to="/admin">
              {t('nav.admin')}
            </NavLink>
          </nav>
        </div>

        <div className="nx-row">
          <Select
            label={t('settings.language')}
            id="hub-locale"
            value={locale}
            options={LOCALE_OPTIONS.map((option) => ({ value: option.id, label: option.label }))}
            onChange={(event) => {
              const next = event.target.value;
              if (next === 'pt-BR' || next === 'en') {
                setLocale(next);
              }
            }}
          />
          <Select
            label={t('settings.scale')}
            id="hub-scale"
            value={scale}
            options={[
              { value: 'auto', label: t('settings.scale.auto') },
              { value: 'compact', label: t('settings.scale.compact') },
              { value: 'default', label: t('settings.scale.default') },
              { value: 'large', label: t('settings.scale.large') },
              { value: 'xlarge', label: t('settings.scale.xlarge') },
            ]}
            onChange={(event) => {
              const next = event.target.value;
              if (next === 'auto' || next === 'compact' || next === 'default' || next === 'large' || next === 'xlarge') {
                setScale(next);
              }
            }}
          />
        </div>
      </header>

      <main style={{ padding: '1.25rem', minWidth: 0 }}>{children}</main>
    </div>
  );
}