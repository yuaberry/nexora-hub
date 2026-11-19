import type { ReactNode } from 'react';
import { Badge, Button, Card, useInterface } from '@nexora/ui';
import { useSiteI18n, type TranslationKey } from '../i18n/SiteI18n.js';

/**
 * Knowledge base do NEXORA HUB.
 *
 * O conteúdo é o que o produto **faz de facto** — o mesmo texto do
 * `docs/` do repositório, servido ao visitante. Nada de manual de
 * funcionalidades que não existem.
 */

/** Artigos da base de conhecimento (chaves explícitas). */
const ARTICLES: readonly {
  readonly id: string;
  readonly title: TranslationKey;
  readonly body: readonly TranslationKey[];
}[] = [
  {
    id: 'comecar',
    title: 'docs.gettingStarted',
    body: ['docs.getting.p1', 'docs.getting.p2', 'docs.getting.p3'],
  },
  {
    id: 'manifestos',
    title: 'docs.manifests',
    body: ['docs.manifests.p1', 'docs.manifests.p2', 'docs.manifests.p3'],
  },
  {
    id: 'verificacao',
    title: 'docs.integrity',
    body: ['docs.integrity.p1', 'docs.integrity.p2'],
  },
  {
    id: 'saves',
    title: 'docs.saves',
    body: ['docs.saves.p1', 'docs.saves.p2', 'docs.saves.p3'],
  },
  {
    id: 'juridico',
    title: 'docs.legal',
    body: ['docs.legal.p1', 'docs.legal.p2', 'docs.legal.p3'],
  },
  {
    id: 'api',
    title: 'docs.api',
    body: ['docs.api.p1', 'docs.api.p2', 'docs.api.p3'],
  },
];

export function DocsPage(): ReactNode {
  const { t } = useSiteI18n();
  const { appliedTheme, toggleTheme } = useInterface();

  return (
    <>
      <section className="site-hero">
        <span className="hub-featured__label">{t('docs.title')}</span>
        <h1 className="site-hero__title">{t('docs.subtitle')}</h1>
      </section>

      <div className="site-docs">
        <nav className="site-docs__nav" aria-label={t('docs.title')}>
          {ARTICLES.map((article) => (
            <a key={article.id} href={`#${article.id}`} className="hub-sidebar__item">
              {t(article.title)}
            </a>
          ))}
        </nav>

        <div className="nx-stack">
          {ARTICLES.map((article) => (
            <article key={article.id} id={article.id} className="site-article">
              <Card>
                <h2>{t(article.title)}</h2>
                {article.body.map((paragraph) => (
                  <p key={paragraph}>{t(paragraph)}</p>
                ))}
              </Card>
            </article>
          ))}
        </div>
      </div>

      <section className="hub-row hub-row--between">
        <span className="nx-subtitle">{t('footer.builtWith')}</span>
        <Badge tone="planned">{t('planned.badge')}</Badge>
        <Button onClick={toggleTheme} aria-label={t('settings.theme.label')}>
          {appliedTheme === 'dark' ? '☾' : '☀'}
        </Button>
      </section>
    </>
  );
}