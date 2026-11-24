import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { Card, useInterface } from '@nexora/ui';
import type { DesktopGameView } from '../../shared/preload-api.js';

/**
 * Sobre o jogo — a descrição curta da loja, em texto simples.
 *
 * A loja é perguntada **uma vez**: a resposta fica na base local e a página
 * passa a lê-la de lá. Sem AppID (entrada de catálogo sem loja, ou jogo
 * local), o cartão diz o que falta em vez de fingir descrição.
 */
export function AboutSection({ game }: { readonly game: DesktopGameView }): ReactNode {
  const { t } = useInterface();
  const api = globalThis.window?.nexora;

  const [description, setDescription] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (api === undefined) {
      return;
    }
    const result = await api.steam.describe(game.id);
    if (result.ok) {
      setDescription(result.description ?? null);
      setMessage(null);
      return;
    }
    setDescription(null);
    setMessage(result.ok ? null : result.message ?? t('about.none'));
  }, [api, game.id, t]);

  useEffect(() => {
    void load();
  }, [load]);

  if (game.steamAppId === null) {
    return null;
  }

  return (
    <Card>
      <div className="nx-stack">
        <strong>{t('about.title')}</strong>
        {description === null ? (
          <p className="nx-subtitle">{message ?? t('common.loading')}</p>
        ) : (
          <p className="hub-about__text">{description}</p>
        )}
      </div>
    </Card>
  );
}
