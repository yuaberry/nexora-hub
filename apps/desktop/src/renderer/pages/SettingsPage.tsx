import { useCallback, useEffect, useState, type ReactNode } from 'react';
import {
  Badge,
  Button,
  Card,
  LOCALE_OPTIONS,
  PlannedNotice,
  SCALE_MODES,
  Select,
  StorageBarView,
  THEME_MODES,
  Toggle,
  useInterface,
  type ScaleMode,
  type ThemeMode,
  type Translator,
} from '@nexora/ui';
import { useDiskUsage, useIsDesktop, useAppInfo } from '../state/desktop.js';
import { PerformanceCard } from '../components/PerformanceCard.js';
import { formatBytes } from '../lib/format.js';
import { FREE_PLAN } from '@nexora/core';

/**
 * Configurações do launcher.
 *
 * Aparência, acessibilidade e armazenamento são preferências do **dispositivo**
 * (`localStorage`): respondem a quem usa o ecrã, e não são sincronizadas com
 * a conta. A barra de armazenamento desenha azul/cinza/amarelo a partir da
 * função pura `storageBar` — a barra nunca mente sobre a capacidade.
 */
export function SettingsPage(): ReactNode {
  const { t, locale, setLocale, theme, setTheme, scale, setScale, reduceMotion, setReduceMotion, highContrast, setHighContrast } = useInterface();
  const storage = useDiskUsage();
  const isDesktop = useIsDesktop();
  const appInfo = useAppInfo();

  const [widgetOn, setWidgetOn] = useState(false);
  const api = globalThis.window?.nexora;

  // O widget de sessão: o HUD sempre ao topo. O estado vive no processo
  // principal (a janela é dele); o botão apenas pede o alternar.
  const onToggleWidget = useCallback(async () => {
    if (api === undefined) {
      return;
    }
    const result = await api.widget.toggle();
    setWidgetOn(result.visible);
  }, [api]);

  useEffect(() => {
    if (api === undefined) {
      return;
    }
    void api.widget.visible().then((result) => {
      setWidgetOn(result.visible);
    });
  }, [api]);

  const usage = storage.value;
  const totalBytes = usage?.totalBytes ?? 0;
  const freeBytes = usage?.freeBytes ?? 0;
  const gamesBytes = usage?.gamesBytes ?? 0;
  const otherBytes = Math.max(0, totalBytes - freeBytes - gamesBytes);


  return (
    <div className="nx-stack">
      <div className="nx-stack">
        <h1 className="nx-title">{t('settings.title')}</h1>
        <p className="nx-subtitle">{t('settings.subtitle')}</p>
      </div>

      <div className="hub-settings-grid">
      <Card>
        <div className="nx-stack">
          <div className="hub-row hub-row--between">
            <strong>{t('widget.title')}</strong>
            <Button onClick={() => void onToggleWidget()}>{widgetOn ? t('widget.hide') : t('widget.show')}</Button>
          </div>
          <p className="nx-subtitle">{t('widget.hint')}</p>
        </div>
      </Card>
      <Card>
        <div className="nx-stack">
          <strong>{t('settings.appearance')}</strong>
          <Select
            label={t('settings.theme')}
            value={theme}
            options={THEME_MODES.map((mode: ThemeMode) => ({ value: mode, label: themeLabel(mode, t) }))}
            onChange={(event) => {
              const next = event.target.value;
              if (next === 'light' || next === 'dark' || next === 'auto') {
                setTheme(next);
              }
            }}
          />
          <Select
            label={t('settings.language')}
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
            value={scale}
            options={SCALE_MODES.map((mode: ScaleMode) => ({ value: mode, label: scaleLabel(mode, t) }))}
            onChange={(event) => {
              const next = event.target.value;
              if (next === 'auto' || next === 'compact' || next === 'default' || next === 'large' || next === 'xlarge') {
                setScale(next);
              }
            }}
          />
        </div>
      </Card>

      <Card>
        <div className="nx-stack">
          <strong>{t('settings.accessibility')}</strong>
          <Toggle
            label={t('settings.reduceMotion')}
            hint={t('settings.reduceMotion.hint')}
            checked={reduceMotion}
            onChange={setReduceMotion}
          />
          <Toggle
            label={t('settings.highContrast')}
            hint={t('settings.highContrast.hint')}
            checked={highContrast}
            onChange={setHighContrast}
          />
        </div>
      </Card>

      <Card>
        <div className="nx-stack">
          <div className="nx-row nx-row--between">
            <strong>{t('settings.storage.title')}</strong>
            {totalBytes === 0 ? (
              <span className="nx-subtitle">{t('settings.storage.unknown')}</span>
            ) : (
              <span className="nx-subtitle">
                {formatBytes(gamesBytes, locale, t)} · {formatBytes(otherBytes, locale, t)} · {formatBytes(freeBytes, locale, t)}
              </span>
            )}
          </div>
          {totalBytes === 0 ? null : (
            <StorageBarView
              used={gamesBytes}
              other={otherBytes}
              total={totalBytes}
              label={t('settings.storage.title')}
            />
          )}
          <div className="hub-suggestions">
            <span className="nx-label">{t('settings.storage.games')}</span>
            <span className="nx-subtitle">{formatBytes(gamesBytes, locale, t)}</span>
            <span className="nx-label">{t('settings.storage.other')}</span>
            <span className="nx-subtitle">{formatBytes(otherBytes, locale, t)}</span>
            <span className="nx-label">{t('settings.storage.free')}</span>
            <span className="nx-subtitle">{formatBytes(freeBytes, locale, t)}</span>
          </div>
          {!isDesktop ? <p className="nx-subtitle">{t('common.desktopOnly')}</p> : null}
          {storage.error === null ? null : <p className="nx-subtitle">{storage.error}</p>}
        </div>
      </Card>

      <Card>
        <div className="nx-stack">
          <strong>{t('common.desktopBadge')}</strong>
          <div className="hub-suggestions">
            <span className="nx-label">{appInfo.value?.platform ?? t('common.desktopOnly')}</span>
            {appInfo.value === null ? null : (
              <span className="nx-subtitle">
                {appInfo.value.versions.app} · Electron {appInfo.value.versions.electron}
              </span>
            )}
          </div>
        </div>
      </Card>

      <Card>
        <div className="nx-stack">
          <strong>{t('settings.account')}</strong>
          <PlannedNotice badge={t('planned.badge')} title={t('planned.account')} hint={t('planned.cloudSync')} />
          <div className="hub-suggestions">
            <span className="nx-label">{t('settings.hotbars.max')}</span>
            <Badge>
              {t('settings.account.plan.free')} · {FREE_PLAN.maxHotbars}
            </Badge>
            <Badge>
              {t('settings.account.plan.premium')} · {t('common.unlimited')}
            </Badge>
          </div>
        </div>
      </Card>
      </div>
    

      {/* Desempenho: as leituras reais do sistema, no diagnóstico do launcher. */}
      <PerformanceCard />
</div>
  );
}

/** Rótulo de cada modo de tema. */
function themeLabel(mode: ThemeMode, t: Translator): string {
  switch (mode) {
    case 'light':
      return t('settings.theme.light');
    case 'dark':
      return t('settings.theme.dark');
    case 'oled':
      return t('settings.theme.oled');
    case 'noir':
      return t('settings.theme.noir');
    default:
      return t('settings.theme.auto');
  }
}

/** Rótulo de cada modo de escala. */
function scaleLabel(mode: ScaleMode, t: Translator): string {
  switch (mode) {
    case 'auto':
      return t('settings.scale.auto');
    case 'compact':
      return t('settings.scale.compact');
    case 'default':
      return t('settings.scale.default');
    case 'large':
      return t('settings.scale.large');
    default:
      return t('settings.scale.xlarge');
  }
}