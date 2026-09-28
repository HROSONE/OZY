/**
 * Motores de decisão que o OZY pode usar por cima do voto local.
 *
 * O voto entre exemplos (o núcleo do OZY) só responde perguntas para as quais há exemplos. Jev e
 * Laya são modelos treinados para responder perguntas novas; plugados aqui, o OZY passa a
 * responder qualquer pergunta tipada — e mantém o que eles não têm: a correção da pessoa valendo
 * na hora, antes do modelo (`OZY.correctAnswer`).
 *
 * Contrato de um motor: `{ name, predict(state, questions, { signal }) → { answers } }`, no formato
 * cru do Jev/Laya. Pode lançar ou demorar: o OZY aplica o prazo e trata falha como "sem resposta".
 */

/**
 * LAYA (Apache 2.0, Convai Innovations) rodando no próprio PC, via `laya-ts` + ONNX Runtime.
 *
 * `agent`: um `Agent` já carregado (ou qualquer objeto com `predict`). Sem ele, `modelDir` é
 * carregado na primeira chamada com `import('laya-ts')` — dependência opcional, instalada pelo
 * usuário (o pacote sai do repositório `NandhaKishorM/laya`, pasta `laya-ts`).
 */
export function createLayaBackend({ agent, modelDir, loadOptions, importar = nome => import(nome) } = {}) {
  if (!agent && (typeof modelDir !== 'string' || !modelDir.trim())) throw new TypeError('Forneça agent ou modelDir.');
  let carregando = null;
  const obter = () => {
    if (agent) return Promise.resolve(agent);
    carregando ||= importar('laya-ts')
      .catch(erro => {
        throw /ERR_MODULE_NOT_FOUND|Cannot find (package|module)/.test(String(erro?.code || erro?.message || erro))
          ? new Error('laya-ts não está instalado. Instale a pasta laya-ts de https://github.com/NandhaKishorM/laya (o pacote ainda não está no npm) e exporte o modelo para ONNX.')
          : erro;
      })
      .then(m => m.Agent.load(modelDir, loadOptions))
      // Falhou (laya-ts ausente, pasta errada): a próxima chamada tenta de novo, em vez de
      // guardar a falha para sempre.
      .catch(erro => { carregando = null; throw erro; });
    return carregando;
  };
  return {
    name: 'laya',
    escalaDoScore: 'zero',
    async predict(state, questions) {
      const a = await obter();
      const limpas = Object.fromEntries(Object.entries(questions).map(([id, q]) => [id, { type: q.type, instructions: q.instructions, ...(q.criteria !== undefined ? { criteria: q.criteria } : {}) }]));
      return a.predict(state, limpas);
    }
  };
}

/**
 * JEV (TypeSafe), pela API paga. O texto SAI do computador: use só quando isso for aceitável.
 * A chave nunca vai para mensagens de erro.
 */
export function createJevBackend({ apiKey, fetch: buscar = globalThis.fetch, endpoint = 'https://api.typesafe.ai/v1/systemone', model = 'jev-latest' } = {}) {
  if (typeof apiKey !== 'string' || !apiKey.trim()) throw new TypeError('apiKey vazia.');
  if (typeof buscar !== 'function') throw new TypeError('fetch indisponível.');
  return {
    name: 'jev',
    escalaDoScore: 'auto',
    async predict(state, questions, { signal } = {}) {
      const corpo = {
        model,
        state: typeof state === 'string' ? state : JSON.stringify(state),
        questions: Object.fromEntries(Object.entries(questions).map(([id, q]) => [id, { type: q.type, instructions: q.instructions, ...(q.criteria !== undefined ? { criteria: q.criteria } : {}) }]))
      };
      const resposta = await buscar(endpoint, {
        method: 'POST',
        signal,
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey.trim()}` },
        body: JSON.stringify(corpo)
      });
      if (!resposta.ok) throw new Error(resposta.status === 401 || resposta.status === 403 ? 'O Jev recusou a chave.' : `O Jev respondeu HTTP ${resposta.status}.`);
      return resposta.json();
    }
  };
}
