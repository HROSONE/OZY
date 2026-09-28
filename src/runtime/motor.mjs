import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import * as ort from 'onnxruntime-node';
import {
  garantirAssetsEmbeddingsLocais,
  pastaDosEmbeddingsLocais,
  assetsDeEmbeddingsCompletos,
  informacoesEmbeddingsLocais
} from './assets.mjs';

const MAX_TOKENS = 256;
const MAX_LOTE = 24;
const CACHE_MAXIMO = 700;
const cache = new Map();
let sessaoPromise = null;
let tokenizadorPromise = null;

function lerVarint(buf, pos) {
  let valor = 0;
  let multiplicador = 1;
  let byte = 0;
  do {
    byte = buf[pos++];
    valor += (byte & 0x7f) * multiplicador;
    multiplicador *= 128;
  } while (byte & 0x80);
  return [valor, pos];
}

function camposProtobuf(buf) {
  const campos = [];
  let pos = 0;
  while (pos < buf.length) {
    let chave;
    [chave, pos] = lerVarint(buf, pos);
    const campo = Math.floor(chave / 8);
    const tipo = chave % 8;
    if (tipo === 0) {
      let valor;
      [valor, pos] = lerVarint(buf, pos);
      campos.push({ campo, valor });
    } else if (tipo === 1) {
      campos.push({ campo, valor: buf.readDoubleLE(pos) });
      pos += 8;
    } else if (tipo === 2) {
      let tamanho;
      [tamanho, pos] = lerVarint(buf, pos);
      campos.push({ campo, bytes: buf.subarray(pos, pos + tamanho) });
      pos += tamanho;
    } else if (tipo === 5) {
      campos.push({ campo, valor: buf.readFloatLE(pos) });
      pos += 4;
    } else {
      throw new Error(`sentencepiece: tipo protobuf ${tipo} inesperado`);
    }
  }
  return campos;
}

function criarTokenizadorSentencePiece(buffer) {
  const modelo = camposProtobuf(buffer);
  const bytesDe = (lista, campo) => lista.find(c => c.campo === campo)?.bytes ?? Buffer.alloc(0);
  const numeroDe = (lista, campo, padrao) => lista.find(c => c.campo === campo)?.valor ?? padrao;
  const pecas = modelo.filter(c => c.campo === 1).map(c => {
    const p = camposProtobuf(c.bytes);
    return {
      texto: bytesDe(p, 1).toString('utf8'),
      pontuacao: numeroDe(p, 2, 0),
      tipo: numeroDe(p, 3, 1)
    };
  });
  if (!pecas.length) throw new Error('sentencepiece sem vocabulário');

  const treino = camposProtobuf(bytesDe(modelo, 2));
  const normalizador = camposProtobuf(bytesDe(modelo, 3));
  const bpe = numeroDe(treino, 3, 1) === 2;
  const prefixoFicticio = numeroDe(normalizador, 3, 1) === 1;
  const tirarEspacosExtras = numeroDe(normalizador, 4, 1) === 1;
  const escaparEspacos = numeroDe(normalizador, 5, 1) === 1;

  const indice = new Map();
  const tipos = new Map();
  let maiorPeca = 0;
  let menorPontuacao = Infinity;
  pecas.forEach((p, id) => {
    indice.set(p.texto, id);
    tipos.set(id, p.tipo);
    maiorPeca = Math.max(maiorPeca, [...p.texto].length);
    if (p.tipo === 1) menorPontuacao = Math.min(menorPontuacao, p.pontuacao);
  });

  const normalizar = texto => {
    let t = String(texto || '').normalize('NFKC');
    if (tirarEspacosExtras) t = t.replace(/\s+/g, ' ').trim();
    if (prefixoFicticio) t = ` ${t}`;
    if (escaparEspacos) t = t.replace(/ /g, '▁');
    return t;
  };

  const unigram = caracteres => {
    const n = caracteres.length;
    const melhor = new Float64Array(n + 1).fill(-Infinity);
    const origem = new Int32Array(n + 1);
    const peca = new Int32Array(n + 1);
    melhor[0] = 0;
    for (let i = 0; i < n; i++) {
      if (melhor[i] === -Infinity) continue;
      let trecho = '';
      let cobreUm = false;
      for (let j = i; j < Math.min(n, i + maiorPeca); j++) {
        trecho += caracteres[j];
        const id = indice.get(trecho);
        if (id === undefined || tipos.get(id) === 3) continue;
        if (j === i) cobreUm = true;
        const nota = melhor[i] + pecas[id].pontuacao;
        if (nota > melhor[j + 1]) {
          melhor[j + 1] = nota;
          origem[j + 1] = i;
          peca[j + 1] = id;
        }
      }
      if (!cobreUm) {
        const nota = melhor[i] + (Number.isFinite(menorPontuacao) ? menorPontuacao - 10 : -100);
        if (nota > melhor[i + 1]) {
          melhor[i + 1] = nota;
          origem[i + 1] = i;
          peca[i + 1] = -1;
        }
      }
    }
    const ids = [];
    const segmentos = [];
    for (let pos = n; pos > 0; pos = origem[pos]) segmentos.push([origem[pos], pos, peca[pos]]);
    for (const [, , id] of segmentos.reverse()) ids.push(id >= 0 ? id : 0);
    return ids;
  };

  const codificarBpe = caracteres => {
    const simbolos = caracteres.slice();
    for (;;) {
      let posicao = -1;
      let melhorNota = -Infinity;
      for (let i = 0; i < simbolos.length - 1; i++) {
        const id = indice.get(simbolos[i] + simbolos[i + 1]);
        if (id !== undefined && pecas[id].pontuacao > melhorNota) {
          melhorNota = pecas[id].pontuacao;
          posicao = i;
        }
      }
      if (posicao < 0) break;
      simbolos.splice(posicao, 2, simbolos[posicao] + simbolos[posicao + 1]);
    }
    return simbolos.map(simbolo => indice.get(simbolo) ?? 0);
  };

  /**
   * XLM-R reserva 0=<s>, 1=<pad>, 2=</s>, 3=<unk> e desloca peças normais do
   * SentencePiece em +1. O token bruto 0 é <unk>, portanto precisa virar 3.
   */
  const converterIdXlmR = idSentencePiece => idSentencePiece === 0 ? 3 : idSentencePiece + 1;

  return {
    codificar(texto) {
      const chars = [...normalizar(texto)];
      const brutos = bpe ? codificarBpe(chars) : unigram(chars);
      return brutos.map(converterIdXlmR);
    }
  };
}

async function obterTokenizador() {
  if (tokenizadorPromise) return tokenizadorPromise;
  tokenizadorPromise = (async () => {
    const pasta = await garantirAssetsEmbeddingsLocais();
    const dados = fs.readFileSync(path.join(pasta, 'sentencepiece.bpe.model'));
    return criarTokenizadorSentencePiece(dados);
  })().catch(erro => {
    tokenizadorPromise = null;
    throw erro;
  });
  return tokenizadorPromise;
}

async function obterSessao() {
  if (sessaoPromise) return sessaoPromise;
  sessaoPromise = (async () => {
    const pasta = await garantirAssetsEmbeddingsLocais();
    return await ort.InferenceSession.create(path.join(pasta, 'model_quantized.onnx'), {
      executionProviders: ['cpu'],
      intraOpNumThreads: Math.max(1, Math.min(4, Number(process.env.OZY_EMBEDDING_THREADS) || 2)),
      interOpNumThreads: 1
    });
  })().catch(erro => {
    sessaoPromise = null;
    throw erro;
  });
  return sessaoPromise;
}

const chaveDoCache = (tipo, texto) => crypto
  .createHash('sha1')
  .update(`${tipo}\0${texto}`)
  .digest('hex');

function colocarNoCache(chave, vetor) {
  if (cache.has(chave)) cache.delete(chave);
  cache.set(chave, vetor);
  while (cache.size > CACHE_MAXIMO) {
    const primeira = cache.keys().next().value;
    if (!primeira) break;
    cache.delete(primeira);
  }
}

function normalizarVetor(vetor) {
  let soma = 0;
  for (const valor of vetor) soma += valor * valor;
  const norma = Math.sqrt(soma) || 1;
  return vetor.map(valor => valor / norma);
}

async function vetorizarLote(textos, tipo) {
  const tokenizador = await obterTokenizador();
  const sessao = await obterSessao();
  const prefixo = tipo === 'query' ? 'query: ' : 'passage: ';
  const tokenizados = textos.map(texto => {
    const corpo = tokenizador.codificar(prefixo + String(texto || '')).slice(0, MAX_TOKENS - 2);
    return [0, ...corpo, 2];
  });
  const comprimento = Math.max(2, ...tokenizados.map(ids => ids.length));
  const lote = tokenizados.length;
  const ids = new BigInt64Array(lote * comprimento);
  const mascara = new BigInt64Array(lote * comprimento);
  const tipos = new BigInt64Array(lote * comprimento);

  for (let b = 0; b < lote; b++) {
    const linha = tokenizados[b];
    for (let i = 0; i < comprimento; i++) {
      const pos = b * comprimento + i;
      ids[pos] = BigInt(i < linha.length ? linha[i] : 1);
      mascara[pos] = BigInt(i < linha.length ? 1 : 0);
      tipos[pos] = 0n;
    }
  }

  const entradas = {};
  for (const nome of sessao.inputNames) {
    if (nome === 'input_ids') entradas[nome] = new ort.Tensor('int64', ids, [lote, comprimento]);
    else if (nome === 'attention_mask') entradas[nome] = new ort.Tensor('int64', mascara, [lote, comprimento]);
    else if (nome === 'token_type_ids') entradas[nome] = new ort.Tensor('int64', tipos, [lote, comprimento]);
  }

  const saidas = await sessao.run(entradas);
  const tensor = Object.values(saidas).find(saida => Array.isArray(saida?.dims) && saida.dims.length === 3);
  if (!tensor) throw new Error('modelo semântico não devolveu last_hidden_state');

  const dimensoes = Number(tensor.dims[2]);
  const dados = tensor.data;
  const resultado = [];

  for (let b = 0; b < lote; b++) {
    const acumulado = new Array(dimensoes).fill(0);
    let tokensValidos = 0;
    for (let i = 0; i < comprimento; i++) {
      if (Number(mascara[b * comprimento + i]) !== 1) continue;
      tokensValidos++;
      const base = (b * comprimento + i) * dimensoes;
      for (let d = 0; d < dimensoes; d++) acumulado[d] += Number(dados[base + d]);
    }
    if (!tokensValidos) tokensValidos = 1;
    for (let d = 0; d < dimensoes; d++) acumulado[d] /= tokensValidos;
    resultado.push(normalizarVetor(acumulado));
  }
  return resultado;
}

export async function gerarEmbeddingsLocais(textos, { tipo = 'passage' } = {}) {
  const lista = (Array.isArray(textos) ? textos : [])
    .map(texto => String(texto || '').replace(/\s+/g, ' ').trim().slice(0, 8_000))
    .filter(Boolean)
    .slice(0, 96);
  if (!lista.length) return [];

  const resultado = new Array(lista.length);
  const faltantes = [];
  for (let i = 0; i < lista.length; i++) {
    const chave = chaveDoCache(tipo, lista[i]);
    const salvo = cache.get(chave);
    if (salvo) resultado[i] = salvo;
    else faltantes.push({ i, chave, texto: lista[i] });
  }

  for (let inicio = 0; inicio < faltantes.length; inicio += MAX_LOTE) {
    const lote = faltantes.slice(inicio, inicio + MAX_LOTE);
    const vetores = await vetorizarLote(lote.map(item => item.texto), tipo);
    lote.forEach((item, indice) => {
      resultado[item.i] = vetores[indice];
      colocarNoCache(item.chave, vetores[indice]);
    });
  }
  return resultado;
}

export async function estadoDosEmbeddingsLocais() {
  return {
    ...informacoesEmbeddingsLocais,
    assetsProntos: await assetsDeEmbeddingsCompletos(pastaDosEmbeddingsLocais()),
    carregado: !!sessaoPromise,
    cache: cache.size
  };
}

export function liberarEmbeddingsLocais() {
  cache.clear();
  sessaoPromise = null;
  tokenizadorPromise = null;
}
