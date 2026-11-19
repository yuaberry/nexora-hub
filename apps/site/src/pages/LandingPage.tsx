import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Badge, Button, Card, PlannedBadge, useInterface } from '@nexora/ui';
import { useSiteI18n, type TranslationKey } from '../i18n/SiteI18n.js';

/**
 * Landing do NEXORA HUB.
 *
 * Regra de conteúdo: **só funcionalidades que existem**. O que falta aparece
 * na secção "A caminho" com o selo Planeado — o site não vende o roadmap como
 * produto. As chaves do FAQ são um par explícito (nunca construídas por
 * concatenação — o tipo do dicionário não as conseguiria validar).
 */

/** Funcionalidades reais (chaves explícitas). */
const FEATURES: readonly { readonly title: TranslationKey; readonly desc: TranslationKey }[] = [
  { title: 'features.library.title', desc: 'features.library.desc' },
  { title: 'features.search.title', desc: 'features.search.desc' },
  { title: 'features.time.title', desc: 'features.time.desc' },
  { title: 'features.downloads.title', desc: 'features.downloads.desc' },
  { title: 'features.verify.title', desc: 'features.verify.desc' },
  { title: 'features.saves.title', desc: 'features.saves.desc' },
  { title: 'features.linux.title', desc: 'features.linux.desc' },
];

/** Fases anunciadas (chaves explícitas). */
const PLANNED: readonly TranslationKey[] = [
  'planned.friends',
  'planned.store',
  'planned.achievements',
  'planned.overlay',
  'planned.remote',
  'planned.bigpicture',
  'planned.ia',
];

/** Perguntas frequentes — pares explícitos de pergunta/resposta. */
const FAQ: readonly { readonly q: TranslationKey; readonly a: TranslationKey }[] = [
  { q: 'faq.q1', a: 'faq.a1' },
  { q: 'faq.q2', a: 'faq.a2' },
  { q: 'faq.q3', a: 'faq.a3' },
  { q: 'faq.q4', a: 'faq.a4' },
  { q: 'faq.q5', a: 'faq.a5' },
  { q: 'faq.q6', a: 'faq.a6' },
];

export function LandingPage(): ReactNode {
  const { t } = useSiteI18n();
  const { appliedTheme, toggleTheme } = useInterface();

  return (
    <>
      <section className="site-hero">
        <span className="hub-featured__label">{t('brand.product')}</span>
        <h1 className="site-hero__title">{t('hero.title')}</h1>
        <p className="site-hero__subtitle">{t('hero.subtitle')}</p>
        <div className="hub-row">
          <Link to="/descarregar" style={{ textDecoration: 'none' }}>
            <Button variant="primary">{t('hero.cta')}</Button>
          </Link>
          <Link to="/documentacao" style={{ textDecoration: 'none' }}>
            <Button>{t('hero.ctaSecondary')}</Button>
          </Link>
        </div>
        <p className="site-hero__note">{t('hero.note')}</p>
      </section>

      <section className="hub-section">
        <div className="hub-section__head">
          <h2 className="nx-title">{t('features.title')}</h2>
          <p className="nx-subtitle">{t('features.subtitle')}</p>
        </div>
        <div className="site-grid">
          {FEATURES.map((feature) => (
            <Card key={feature.title}>
              <div className="nx-stack">
                <strong>{t(feature.title)}</strong>
                <span className="nx-subtitle">{t(feature.desc)}</span>
              </div>
            </Card>
          ))}
        </div>
      </section>

      <section className="hub-section">
        <h2 className="nx-title">{t('how.title')}</h2>
        <div className="site-steps">
          {(['how.step1', 'how.step2', 'how.step3'] as const).map((step, index) => (
            <div key={step} className="site-step">
              <span className="site-step__num">{index + 1}</span>
              <span>{t(step)}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="hub-section">
        <div className="hub-section__head">
          <h2 className="nx-title">{t('planned.title')}</h2>
          <PlannedBadge label={t('planned.badge')} />
        </div>
        <p className="nx-subtitle">{t('planned.subtitle')}</p>
        <div className="site-chips">
          {PLANNED.map((item) => (
            <Badge key={item} tone="planned">
              {t(item)}
            </Badge>
          ))}
        </div>
      </section>

      <section className="hub-section" id="perguntas">
        <h2 className="nx-title">{t('faq.title')}</h2>
        <div className="nx-stack">
          {FAQ.map((entry) => (
            <details key={entry.q} className="nx-card">
              <summary style={{ cursor: 'pointer', fontWeight: 600 }}>{t(entry.q)}</summary>
              <p className="nx-subtitle" style={{ marginTop: '0.5rem' }}>
                {t(entry.a)}
              </p>
            </details>
          ))}
        </div>
      </section>

      <section className="hub-row hub-row--between">
        <span className="nx-subtitle">{t('footer.builtWith')}</span>
        <Button onClick={toggleTheme} aria-label={t('settings.theme.label')}>
          {appliedTheme === 'dark' ? '☾' : '☀'}
        </Button>
      </section>
    </>
  );
}