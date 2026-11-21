import { describe, expect, it } from 'vitest';
import { VdfParseError, parseVdf, vdfObject, vdfString } from '../src/importers/vdf.js';
import {
  parseSteamAppManifest,
  parseSteamLibraryFolders,
  steamInstallPath,
  steamManifestFileName,
} from '../src/importers/steam.js';

/**
 * Importadores — leitura dos ficheiros que a Steam escreve.
 *
 * As fixtures são **ficheiros reais** (capturados de uma instalação Steam
 * verdadeira em Linux): o parser é escrito contra o formato que existe, não
 * contra um formato imaginado — e o teste fixa o que a Steam escreve.
 */

/** `libraryfolders.vdf` real ( Steam em `/home/llinux/.local/share/Steam`). */
const LIBRARY_FOLDERS = `"libraryfolders"
{
	"0"
	{
		"path"		"/home/llinux/.local/share/Steam"
		"label"		""
		"contentid"		"2796001301272473179"
		"totalsize"		"0"
		"update_clean_bytes_tally"	"891245115"
		"time_last_update_verified"	"1789941151"
		"apps"
		{
			"367520"		"5231995691"
			"1493710"		"1537166031"
			"3241660"		"1492605039"
			"4183110"		"672162947"
			"4628710"		"1445063149"
		}
	}
}
`;

/** `appmanifest_3241660.acf` real — o jogo chama-se `R.E.P.O.`, a pasta `REPO`. */
const APP_MANIFEST = `"AppState"
{
	"appid"		"3241660"
	"Universe"		"1"
	"name"		"R.E.P.O."
	"StateFlags"		"4"
	"installdir"		"REPO"
	"LastUpdated"		"17898641207"
	"LastPlayed"		"1789770602"
	"SizeOnDisk"		"1492605039"
}
`;

describe('parseVdf', () => {
  it('lê pares, blocos e tabulações do formato real', () => {
    const root = parseVdf(LIBRARY_FOLDERS);
    const folders = vdfObject(root.get('libraryfolders'));
    expect(folders).not.toBeNull();
    const first = vdfObject(folders?.get('0'));
    expect(vdfString(first?.get('path'))).toBe('/home/llinux/.local/share/Steam');
    // Uma entrada vazia fica vazia — não `undefined` disfarçado.
    expect(vdfString(first?.get('label'))).toBe('');
    const apps = vdfObject(first?.get('apps'));
    expect([...(apps?.keys() ?? [])]).toEqual(['367520', '1493710', '3241660', '4183110', '4628710']);
  });

  it('ignora comentários // e espaços soltos', () => {
    const root = parseVdf('// um comentário\n"chave" { // outro\n "sub" "valor" }\n');
    expect(vdfString(vdfObject(root.get('chave'))?.get('sub'))).toBe('valor');
  });

  it('lê aspas escapadas dentro do valor', () => {
    const root = parseVdf('"nome" "diz \\"olá\\""');
    expect(vdfString(root.get('nome'))).toBe('diz "olá"');
  });

  it('devolve mapa vazio para ficheiro vazio', () => {
    expect(parseVdf('').size).toBe(0);
    expect(parseVdf('   \n\t ').size).toBe(0);
  });

  it('recusa um ficheiro partido, com a posição do erro', () => {
    expect(() => parseVdf('"chave" "valor')).toThrow(VdfParseError);
    try {
      parseVdf('"chave" "valor');
    } catch (error) {
      expect((error as VdfParseError).position).toBeGreaterThan(0);
    }
  });
});

describe('bibliotecas da Steam', () => {
  it('lê o caminho e os appids da biblioteca real', () => {
    const libraries = parseSteamLibraryFolders(LIBRARY_FOLDERS);
    expect(libraries).toHaveLength(1);
    expect(libraries[0]?.path).toBe('/home/llinux/.local/share/Steam');
    expect(libraries[0]?.appIds).toEqual(['367520', '1493710', '3241660', '4183110', '4628710']);
  });

  it('aceita o formato antigo (caminho como valor directo)', () => {
    const libraries = parseSteamLibraryFolders('"libraryfolders"\n{\n"0" "/media/jogos"\n}\n');
    expect(libraries[0]?.path).toBe('/media/jogos');
  });

  it('ignora biblioteca sem caminho', () => {
    const libraries = parseSteamLibraryFolders('"libraryfolders"\n{\n"0"\n{\n"apps" { "1" "2" }\n}\n}\n');
    expect(libraries).toHaveLength(0);
  });

  it('ficheiro sem libraryfolders devolve lista vazia', () => {
    expect(parseSteamLibraryFolders('"outro"\n{\n"x" "1"\n}\n')).toHaveLength(0);
  });
});

describe('manifestos de jogos', () => {
  it('lê o título real e a pasta do jogo', () => {
    const manifest = parseSteamAppManifest(APP_MANIFEST);
    expect(manifest).toEqual({
      appId: '3241660',
      name: 'R.E.P.O.',
      installDir: 'REPO',
      stateFlags: 4,
    });
  });

  it('o manifesto da ferramenta também é lido — quem filtra é a importação', () => {
    const proton = parseSteamAppManifest(`"AppState"
{
	"appid"		"1493710"
	"name"		"Proton Experimental"
	"StateFlags"		"6"
	"installdir"		"Proton - Experimental"
}
`);
    expect(proton?.name).toBe('Proton Experimental');
    expect(proton?.stateFlags).toBe(6);
  });

  it('manifesto sem nome devolve null (nada a importar)', () => {
    expect(parseSteamAppManifest('"AppState"\n{\n"appid" "1"\n"installdir" "jogo"\n}\n')).toBeNull();
  });

  it('manifesto sem pasta de instalação devolve null', () => {
    expect(parseSteamAppManifest('"AppState"\n{\n"appid" "1"\n"name" "Jogo"\n}\n')).toBeNull();
  });

  it('manifesto truncado lança o erro do parser (a importação salta-o)', () => {
    // A Steam escreve temporários enquanto baixa e um manifesto pode ficar
    // cortado a meio: o parser diz onde parou, e quem importa decide saltar
    // aquele ficheiro — nunca improvisar uma entrada com metade dos dados.
    expect(() => parseSteamAppManifest('"AppState"\n{\n"appid" "1"\n')).toThrow(VdfParseError);
  });

  it('StateFlags ausente ou não numérico fica null', () => {
    expect(parseSteamAppManifest('"AppState"\n{\n"appid" "1"\n"name" "Jogo"\n"installdir" "jogo"\n}\n')?.stateFlags).toBeNull();
  });
});

describe('caminhos', () => {
  it('junta a biblioteca com a pasta do jogo', () => {
    expect(steamInstallPath('/home/llinux/.local/share/Steam', 'Hollow Knight')).toBe(
      '/home/llinux/.local/share/Steam/steamapps/common/Hollow Knight',
    );
  });

  it('ignora uma barra final na raiz da biblioteca', () => {
    expect(steamInstallPath('/media/jogos/', 'REPO')).toBe('/media/jogos/steamapps/common/REPO');
  });

  it('o nome do manifesto é previsível', () => {
    expect(steamManifestFileName('3241660')).toBe('appmanifest_3241660.acf');
  });
});

/** Reexportação para o teste usar o mesmo parser pelos dois caminhos. */
export { parseSteamAppManifest };