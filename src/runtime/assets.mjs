import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import os from 'os';
import { Readable, Transform } from 'stream';
import { pipeline } from 'stream/promises';

/**
 * Embeddings semânticos LOCAIS da Fase 3.
 *
 * Modelo: Xenova/multilingual-e5-small (ONNX int8/quantized), derivado do multilingual-e5-small.
 * O modelo e o tokenizador são baixados uma vez no computador e verificados por SHA-256.
 * Nenhum texto do usuário é enviado ao Hugging Face: só os ARQUIVOS DO MODELO são baixados.
 */
const REVISAO = '47e7f55';
const BASE = `https://huggingface.co/Xenova/multilingual-e5-small/resolve/${REVISAO}`;

export const ARQUIVOS_EMBEDDINGS_LOCAIS = [
  {
    nome: 'model_quantized.onnx',
    remoto: 'onnx/model_quantized.onnx',
    tamanho: 118_308_185,
    sha256: 'f80102d3f2a1229f387d3c81909990d8945513e347b0eab049f7de3c6f98c193'
  },
  {
    nome: 'sentencepiece.bpe.model',
    remoto: 'sentencepiece.bpe.model',
    tamanho: null,
    sha256: 'cfc8146abe2a0488e9e2a0c56de7952f7c11ab059eca145a0a727afce0db2865'
  }
];

const PRAZO_SEM_DADOS_MS = 60_000;
const downloadsEmAndamento = new Map();

export function pastaDosEmbeddingsLocais() {
  // Mesma raiz persistente usada pelo cérebro local. process.cwd() muda entre dev e Electron e
  // faria o modelo "sumir" após reinstalação ou ao abrir o app por outro atalho.
  const raiz = process.env.OZY_MODELS_DIR || (
    process.platform === 'win32'
      ? path.join(process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'), 'OZY', '.ozy-models')
      : process.platform === 'darwin'
        ? path.join(os.homedir(), 'Library', 'Application Support', 'OZY', '.ozy-models')
        : path.join(process.env.XDG_DATA_HOME || path.join(os.homedir(), '.local', 'share'), 'OZY', '.ozy-models')
  );
  return path.join(raiz, 'embeddings', 'multilingual-e5-small');
}

async function sha256DoArquivo(arquivo) {
  return await new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const stream = fs.createReadStream(arquivo);
    stream.on('error', reject);
    stream.on('data', bloco => hash.update(bloco));
    stream.on('end', () => resolve(hash.digest('hex')));
  });
}

async function arquivoValido(pasta, spec) {
  const arquivo = path.join(pasta, spec.nome);
  try {
    if (spec.tamanho && fs.statSync(arquivo).size !== spec.tamanho) return false;
    return await sha256DoArquivo(arquivo) === spec.sha256;
  } catch {
    return false;
  }
}

export async function assetsDeEmbeddingsCompletos(pasta = pastaDosEmbeddingsLocais()) {
  const marca = path.join(pasta, '.verified-release');
  try {
    if (fs.readFileSync(marca, 'utf8').trim() !== REVISAO) return false;
  } catch {
    return false;
  }
  for (const spec of ARQUIVOS_EMBEDDINGS_LOCAIS) {
    if (!(await arquivoValido(pasta, spec))) return false;
  }
  return true;
}

async function baixarArquivo(pasta, spec, aoProgredir) {
  const destino = path.join(pasta, spec.nome);
  if (await arquivoValido(pasta, spec)) {
    aoProgredir?.({ arquivo: spec.nome, estado: 'pronto' });
    return;
  }

  const temporario = `${destino}.part`;
  fs.rmSync(temporario, { force: true });
  const controle = new AbortController();
  let vigia = setTimeout(
    () => controle.abort(new Error(`${spec.nome}: ${PRAZO_SEM_DADOS_MS / 1000}s sem receber dados`)),
    PRAZO_SEM_DADOS_MS
  );

  try {
    const resposta = await fetch(`${BASE}/${spec.remoto}`, {
      redirect: 'follow',
      signal: controle.signal,
      headers: { 'User-Agent': 'OZY-local-embeddings/1.0' }
    });
    if (!resposta.ok || !resposta.body) {
      throw new Error(`download de ${spec.nome} retornou HTTP ${resposta.status}`);
    }

    let recebido = 0;
    const contador = new Transform({
      transform(bloco, _codificacao, pronto) {
        clearTimeout(vigia);
        vigia = setTimeout(
          () => controle.abort(new Error(`${spec.nome}: ${PRAZO_SEM_DADOS_MS / 1000}s sem receber dados`)),
          PRAZO_SEM_DADOS_MS
        );
        recebido += bloco.length;
        aoProgredir?.({ arquivo: spec.nome, recebido, total: spec.tamanho || undefined });
        pronto(null, bloco);
      }
    });
    await pipeline(Readable.fromWeb(resposta.body), contador, fs.createWriteStream(temporario));

    if (spec.tamanho && fs.statSync(temporario).size !== spec.tamanho) {
      throw new Error(`${spec.nome} chegou incompleto`);
    }
    const hash = await sha256DoArquivo(temporario);
    if (hash !== spec.sha256) throw new Error(`${spec.nome} não corresponde ao SHA-256 esperado`);

    // No Windows, rename sobre um destino antigo/corrompido pode falhar com EEXIST/EPERM.
    // O temporário já passou por tamanho + SHA; só então removemos a cópia inválida e promovemos.
    fs.rmSync(destino, { force: true });
    fs.renameSync(temporario, destino);
  } catch (erro) {
    fs.rmSync(temporario, { force: true });
    throw controle.signal.aborted && controle.signal.reason instanceof Error
      ? controle.signal.reason
      : erro;
  } finally {
    clearTimeout(vigia);
  }
}

export async function garantirAssetsEmbeddingsLocais({
  pasta = pastaDosEmbeddingsLocais(),
  aoProgredir
} = {}) {
  if (await assetsDeEmbeddingsCompletos(pasta)) return pasta;
  if (process.env.OZY_OFFLINE === '1') throw new Error('OZY offline: modelo ausente ou inválido. Execute npm run model:download com internet.');
  const existente = downloadsEmAndamento.get(pasta);
  if (existente) return existente;

  const trabalho = (async () => {
    fs.mkdirSync(pasta, { recursive: true });
    for (const spec of ARQUIVOS_EMBEDDINGS_LOCAIS) {
      await baixarArquivo(pasta, spec, aoProgredir);
    }
    fs.writeFileSync(path.join(pasta, '.verified-release'), `${REVISAO}\n`, 'utf8');
    if (!(await assetsDeEmbeddingsCompletos(pasta))) {
      throw new Error('os arquivos dos embeddings não passaram na conferência final');
    }
    return pasta;
  })().finally(() => downloadsEmAndamento.delete(pasta));

  downloadsEmAndamento.set(pasta, trabalho);
  return trabalho;
}

export const informacoesEmbeddingsLocais = {
  revisao: REVISAO,
  modelo: 'Xenova/multilingual-e5-small',
  quantizacao: 'ONNX quantized/int8',
  dimensoes: 384,
  licencaModeloBase: 'MIT'
};
