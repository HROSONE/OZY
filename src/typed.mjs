/**
 * Perguntas tipadas no formato do Jev (TypeSafe) e do Laya (Convai):
 *
 *   { type: 'noul' | 'choice' | 'score', instructions, criteria? }
 *     choice → criteria: { id: descrição }   (2 a 255 opções)
 *     score  → criteria: [nível0, nível1, …]  (2 a 10 níveis, do menor ao maior)
 *
 * O mesmo pedido serve aos três motores: quem usa o OZY troca Jev, Laya ou o voto local sem
 * mudar o código. As respostas de qualquer motor passam por `normalizarResposta`, que descarta o
 * que não bate com a pergunta feita — uma escolha fora das opções oferecidas nunca vira ação.
 *
 * ESCALA DO SCORE: o OZY devolve `score` como NÍVEL ESPERADO a partir de 0 (a convenção do Laya:
 * soma de índice × probabilidade) e `level` como o nível mais provável. A escala do Jev não foi
 * conferida com uma chamada real; o adaptador dele converte quando a nota passa do último índice.
 */
export const TIPOS = new Set(['noul', 'choice', 'score']);

export function validarPerguntas(questions) {
  if (!questions || typeof questions !== 'object' || Array.isArray(questions)) throw new TypeError('questions deve ser um objeto { id: pergunta }.');
  const ids = Object.keys(questions);
  if (!ids.length) throw new TypeError('Nenhuma pergunta.');
  for (const id of ids) {
    const q = questions[id];
    if (!q || typeof q !== 'object' || !TIPOS.has(q.type)) throw new TypeError(`"${id}": type deve ser noul, choice ou score.`);
    if (typeof q.instructions !== 'string' || !q.instructions.trim()) throw new TypeError(`"${id}": instructions vazio.`);
    if (q.type === 'choice') {
      const c = q.criteria;
      const n = c && typeof c === 'object' && !Array.isArray(c) ? Object.keys(c).length : 0;
      if (n < 2 || n > 255) throw new TypeError(`"${id}": choice precisa de 2 a 255 opções em criteria.`);
      if (Object.entries(c).some(([k, v]) => !k || typeof v !== 'string' || !v.trim())) throw new TypeError(`"${id}": cada opção precisa de id e descrição.`);
    }
    if (q.type === 'score') {
      if (!Array.isArray(q.criteria) || q.criteria.length < 2 || q.criteria.length > 10 || q.criteria.some(v => typeof v !== 'string' || !v.trim())) {
        throw new TypeError(`"${id}": score precisa de 2 a 10 níveis em criteria.`);
      }
    }
    if (q.collection !== undefined && (typeof q.collection !== 'string' || !q.collection.trim())) throw new TypeError(`"${id}": collection inválida.`);
  }
  return ids;
}

/** Assinatura da pergunta: correções valem para a MESMA pergunta, não para qualquer uma com o mesmo id. */
export function assinatura(q) {
  const crit = q.type === 'choice' ? Object.keys(q.criteria).sort().join('|') : q.type === 'score' ? String(q.criteria.length) : '';
  return `${q.type}\0${q.instructions.trim()}\0${crit}`;
}

const numero = v => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);
const probs = v => {
  if (!v || typeof v !== 'object') return undefined;
  const saida = Object.fromEntries(Object.entries(v).map(([k, p]) => [k, numero(p)]).filter(([, p]) => p !== undefined && p >= 0 && p <= 1));
  return Object.keys(saida).length ? saida : undefined;
};

/**
 * Uma resposta crua de qualquer motor → resposta do OZY, ou null se não serve para esta pergunta.
 * `escalaDoScore`: 'zero' (Laya, 0…n-1) ou 'auto' (converte 1…n quando passa do último índice).
 */
export function normalizarResposta(q, bruta, fonte, { escalaDoScore = 'zero' } = {}) {
  if (!bruta || typeof bruta !== 'object') return null;
  const confidence = numero(bruta.answer_confidence) ?? numero(bruta.confidence);
  if (q.type === 'noul') {
    const noul = numero(bruta.noul);
    if (noul === undefined || noul < 0 || noul > 1) return null;
    return { status: 'decided', type: 'noul', noul, confidence: confidence ?? Math.max(noul, 1 - noul), source: fonte };
  }
  if (q.type === 'choice') {
    const choice = typeof bruta.choice === 'string' ? bruta.choice : '';
    // Só uma das opções oferecidas. `hasOwn`, e não `in`: "toString" não é opção.
    if (!choice || !Object.hasOwn(q.criteria, choice)) return null;
    const p = probs(bruta.probabilities);
    const probabilities = p && Object.keys(p).every(k => Object.hasOwn(q.criteria, k)) ? p : undefined;
    return { status: 'decided', type: 'choice', choice, probabilities, confidence: confidence ?? probabilities?.[choice], source: fonte };
  }
  let score = numero(bruta.score);
  const n = q.criteria.length;
  if (score === undefined) return null;
  if (escalaDoScore === 'auto' && score > n - 1) score -= 1;
  if (score < 0 || score > n - 1) return null;
  const p = probs(bruta.probabilities);
  const level = p ? Number(Object.entries(p).sort((a, b) => b[1] - a[1])[0][0]) : Math.round(score);
  return { status: 'decided', type: 'score', score, level: Number.isInteger(level) && level >= 0 && level < n ? level : Math.round(score), probabilities: p, confidence, source: fonte };
}
