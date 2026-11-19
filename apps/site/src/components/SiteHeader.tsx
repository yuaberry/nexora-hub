import type { ReactNode } from 'react';
import { NavLink } from 'react-router-dom';
import { LOCALES, useSiteI18n, type Locale } from '../i18n/SiteI18n.js';

/**
 * Cabeçalho do site — marca, navegação e selector de idioma.
 *
 * O tema claro/escuro é preferência do dispositivo (`localStorage`), como no
 * launcher: responde ao ecrã de quem visita, não à conta.
 */
export function SiteHeader(): ReactNode {
  const { t, locale, setLocale } = useSiteI18n();

  return (
    <header className="site-header">
      <NavLink to="/" className="hub-brand" style={{ textDecoration: 'none', color: 'inherit' }}>
        <span className="hub-brand__mark" aria-hidden="true">NX</span>
        <span className="hub-brand__name">{t('brand.name')}</span>
      </NavLink>

      <nav className="site-header__nav" aria-label={t('brand.name')}>
        <NavLink to="/descarregar" className="hub-nav__item">
          {t('nav.download')}
        </NavLink>
        <NavLink to="/documentacao" className="hub-nav__item">
          {t('nav.docs')}
        </NavLink>
        <NavLink to="/#perguntas" className="hub-nav__item">
          {t('nav.faq')}
        </NavLink>
        <select
          className="nx-select"
          aria-label="Idioma"
          value={locale}
          onChange={(event) => {
            const next = event.target.value;
            if (next === 'pt-BR' || next === 'en') {
              setLocale(next as Locale);
            }
          }}
        >
          {LOCALES.map((option: Locale) => (
            <option key={option} value={option}>
              {option === 'pt-BR' ? 'Português (Brasil)' : 'English'}
            </option>
          ))}
        </select>
      </nav>
    </header>
  );
}

/** Rodapé do site — direitos, contacto e ligações legais. */
export function SiteFooter(): ReactNode {
  const { t } = useSiteI18n();
  return (
    <footer className="site-footer">
      <span className="nx-subtitle">
        {t('brand.name')} — {t('footer.rights')}
      </span>
      <div className="hub-row">
        <NavLink to="/documentacao#juridico" className="hub-nav__item">
          {t('footer.legal')}
        </NavLink>
        <NavLink to="/documentacao" className="hub-nav__item">
          {t('footer.docs')}
        </NavLink>
        <span className="nx-subtitle">
          {t('footer.contact')}: {t('footer.contactValue')}
        </span>
      </div>
    </footer>
  );
}