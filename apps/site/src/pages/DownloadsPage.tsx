import type { ReactNode } from 'react';
import { Badge, Button, Card, useInterface } from '@nexora/ui';
import { useSiteI18n, type TranslationKey } from '../i18n/SiteI18n.js';

/**
 * Página de descargas.
 *
 * Honestidade de Release: os artefactos publicados são os que existem. Linux
 * x64 está construído e verificado; Windows e macOS aparecem como "em breve"
 * com o que falta dito (build multiplataforma no pipeline) — nunca um botão
 * que finge um ficheiro que não existe.
 */

/** Artefactos (chaves explícitas). */
const BUILDS: readonly {
  readonly platform: TranslationKey;
  readonly target: TranslationKey | null;
  readonly file: string | null;
  readonly status: 'available' | 'planned';
}[] = [
  { platform: 'downloads.linux', target: 'downloads.appimage', file: 'nexora-hub-0.1.0-x86_64.AppImage', status: 'available' },
  { platform: 'downloads.linux', target: 'downloads.deb', file: 'nexora-hub-0.1.0-amd64.deb', status: 'available' },
  { platform: 'downloads.windows', target: null, file: null, status: 'planned' },
  { platform: 'downloads.macos', target: null, file: null, status: 'planned' },
];

export function DownloadsPage(): ReactNode {
  const { t } = useSiteI18n();
  const { appliedTheme, toggleTheme } = useInterface();

  return (
    <>
      <section className="site-hero">
        <span className="hub-featured__label">{t('downloads.title')}</span>
        <h1 className="site-hero__title">{t('downloads.subtitle')}</h1>
      </section>

      <section className="site-grid">
        {BUILDS.map((build) => (
          <Card key={build.platform + (build.target ?? '')}>
            <div className="nx-stack">
              <div className="hub-row hub-row--between">
                <strong>{t(build.platform)}</strong>
                {build.status === 'planned' ? <Badge tone="planned">{t('downloads.soon')}</Badge> : null}
              </div>

              {build.status === 'planned' ? (
                <span className="nx-subtitle">{t('downloads.soonHint')}</span>
              ) : (
                <>
                  {build.target === null ? null : <span className="nx-subtitle">{t(build.target)}</span>}
                  <code className="hub-break">{build.file ?? ''}</code>
                  <span className="nx-subtitle">{t('downloads.publishHint')}</span>
                </>
              )}
            </div>
          </Card>
        ))}
      </section>

      <Card>
        <div className="nx-stack">
          <strong>{t('downloads.requirements')}</strong>
          <span className="nx-subtitle">{t('downloads.requirementsText')}</span>
        </div>
      </Card>

      <section className="hub-row hub-row--between">
        <span className="nx-subtitle">{t('footer.builtWith')}</span>
        <Button onClick={toggleTheme} aria-label={t('settings.theme.label')}>
          {appliedTheme === 'dark' ? '☾' : '☀'}
        </Button>
      </section>
    </>
  );
}