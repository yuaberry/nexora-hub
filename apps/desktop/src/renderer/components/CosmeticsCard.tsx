import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { Badge, Button, Card, useInterface } from '@nexora/ui';
import { useAuth } from '../state/auth.js';
import { apiRequest } from '../lib/api.js';

/**
 * Cosméticos — o que os pontos compram.
 *
 * O saldo é o mesmo das conquistas e das tarefas (o livro de pontos), e cada
 * item mostra o custo, o que falta quando não chega, e o que já é teu. O selo
 * que equipas aparece ao lado do teu nome na barra lateral — não há cosmético
 * que não se veja, nem selo que ninguém pagou.
 */

/** Um item do catálogo, visto pelo launcher. */
interface CosmeticItem {
  readonly id: string;
  readonly nameKey: string;
  readonly descriptionKey: string;
  readonly cost: number;
  readonly owned: boolean;
  readonly equipped: boolean;
  readonly missing: number;
}

/** O que a API devolve. */
interface CosmeticsState {
  readonly balance: number;
  readonly items: readonly CosmeticItem[];
}

export function CosmeticsCard(): ReactNode {
  const { t, locale } = useInterface();
  const { user } = useAuth();
  const [state, setState] = useState<CosmeticsState | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (user === null) {
      return;
    }
    try {
      setState(await apiRequest<CosmeticsState>('/api/v1/cosmetics'));
    } catch {
      setState(null);
    }
  }, [user]);

  useEffect(() => {
    void reload();
  }, [reload]);

  // Uma escrita que muda o catálogo (compra ou equipar) recarrega-o — o saldo
  // e o estado do item vêm sempre do servidor, nunca de um optimismo local.
  const write = useCallback(
    async (path: string, success: string) => {
      try {
        await apiRequest(path, { method: 'POST' });
        setMessage(success);
      } catch {
        setMessage(t('error.generic'));
        return;
      }
      await reload();
      // O selo vive ao lado do nome, na barra lateral: sem este aviso, a
      // sidebar mostraria o selo antigo até à próxima abertura da app.
      globalThis.dispatchEvent(new Event('nexora:cosmetics-changed'));
    },
    [reload, t],
  );

  if (user === null || state === null) {
    return null;
  }

  return (
    <Card>
      <div className="nx-stack">
        <div className="hub-row hub-row--between">
          <div className="nx-stack">
            <strong>{t('cosmetics.title')}</strong>
            <span className="nx-subtitle">{t('cosmetics.subtitle')}</span>
          </div>
          <Badge>
            {new Intl.NumberFormat(locale).format(state.balance)} {t('achievements.points')}
          </Badge>
        </div>

        {message === null ? null : <p className="nx-banner"><span>{message}</span></p>}

        {state.items.map((item) => (
          <div key={item.id} className="hub-row hub-row--between">
            <div className="nx-stack">
              <span className="hub-break">{t(cosmeticName(item.id))}</span>
              <span className="nx-subtitle">{t(cosmeticDescription(item.id))}</span>
              <span className="nx-subtitle">
                {item.owned
                  ? t('cosmetics.owned')
                  : t('cosmetics.cost', { cost: new Intl.NumberFormat(locale).format(item.cost) }) +
                    (item.missing > 0 ? ` — ${t('cosmetics.missing', { missing: item.missing })}` : '')}
              </span>
            </div>
            <div className="hub-row">
              {item.equipped ? <Badge tone="positive">{t('cosmetics.equipped')}</Badge> : null}
              {item.equipped ? (
                <Button onClick={() => void write(`/api/v1/cosmetics/${item.id}/unequip`, t('cosmetics.unequipped'))}>
                  {t('cosmetics.unequip')}
                </Button>
              ) : item.owned ? (
                <Button onClick={() => void write(`/api/v1/cosmetics/${item.id}/equip`, t('cosmetics.equipped'))}>
                  {t('cosmetics.equip')}
                </Button>
              ) : (
                <Button
                  variant="primary"
                  disabled={item.missing > 0}
                  onClick={() =>
                    void write(`/api/v1/cosmetics/${item.id}/buy`, t('cosmetics.purchased', { cost: item.cost }))
                  }
                >
                  {t('cosmetics.buy')}
                </Button>
              )}
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

/** A chave do nome de um cosmético (explícita — o catálogo é conhecido). */
function cosmeticName(id: string): 'cosmetic.badge.owl.name' | 'cosmetic.badge.marathon.name' | 'cosmetic.badge.century.name' {
  switch (id) {
    case 'badge-owl':
      return 'cosmetic.badge.owl.name';
    case 'badge-marathon':
      return 'cosmetic.badge.marathon.name';
    default:
      return 'cosmetic.badge.century.name';
  }
}

/** A chave da descrição de um cosmético (explícita). */
function cosmeticDescription(id: string): 'cosmetic.badge.owl.description' | 'cosmetic.badge.marathon.description' | 'cosmetic.badge.century.description' {
  switch (id) {
    case 'badge-owl':
      return 'cosmetic.badge.owl.description';
    case 'badge-marathon':
      return 'cosmetic.badge.marathon.description';
    default:
      return 'cosmetic.badge.century.description';
  }
}