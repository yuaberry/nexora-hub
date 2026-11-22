import { useState, type ReactNode } from 'react';

/**
 * Imagem de capa com placeholder honesto.
 *
 * Uma capa vivem em dois sítios: no disco do utilizador (servida pelo
 * esquema interno `nexora://cover/`) ou na loja pública (a cápsula de uma
 * entrada de catálogo, em `https://cdn.akamai.steamstatic.com`). Os dois
 * podem falhar — um ficheiro apagado, um endereço que a loja um dia
 * desligue — e uma moldura vazia não diz nada a quem vê.
 *
 * Regra: quando a imagem não carrega, o **placeholder do tema** (as iniciais
 * do jogo, dadas por quem chama) toma o lugar. Nunca uma moldura partida, e
 * nunca uma imagem inventada.
 */
export function GameImage({
  src,
  fit,
  alt,
  fallback,
}: {
  readonly src: string | null;
  /** `contain` para logos e cabeçalhos (arte com margens); `cover` para o resto. */
  readonly fit: 'cover' | 'contain';
  readonly alt: string;
  /** O que desenhar quando não há imagem (ou ela falha). */
  readonly fallback: ReactNode;
}): ReactNode {
  const [failed, setFailed] = useState(false);

  if (src === null || failed) {
    return <>{fallback}</>;
  }

  return (
    <img
      src={src}
      alt={alt}
      loading="lazy"
      style={{ objectFit: fit }}
      onError={() => {
        setFailed(true);
      }}
    />
  );
}