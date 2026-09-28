import { cosseno, contarVotos } from './voting.mjs';
import { PERGUNTAS_DO_TURNO, LIMIAR } from './questions.mjs';
import { candidatoAComando, EXEMPLOS_DO_COMANDO, limpar } from './commands.mjs';
import { EXEMPLOS_DAS_FAMILIAS, EXEMPLOS_DE_RISCO } from './collections.mjs';
import { candidatosPara, escolhaExata, descreverElemento } from './elements.mjs';

const normalize = text => text.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim();
const riskPattern = /\b(apagar|pague|pagamento|pagamentos|exclu\w*|delet\w*|envi\w*|pagar|pague|pagamento|pagamentos|compr\w*|pix|transfer\w*|public\w*|encerrar|esvaziar|desativar|descartar|zerar|revogar|cancelar|restaurar|resetar|quitar|formatar|assinar|contratar|delete|remove|pay|purchase|send|submit)\b/;
const abstain = reason => ({ status: 'abstain', reason });
const validVectors = (vectors, count) => Array.isArray(vectors) && vectors.length === count && count > 0 && vectors.every(v => Array.isArray(v) && v.length === vectors[0].length && v.length > 0 && v.every(Number.isFinite) && v.some(n => n !== 0));

/** Scores are vote shares / cosine similarities, NOT calibrated probabilities. */
export class OZY {
  #embed; #collections = new Map(); #cache = new Map(); #dimension;
  constructor({ embed, timeoutMs = 1500, maxCache = 1500 } = {}) {
    if (typeof embed !== 'function') throw new TypeError('Forneça embed(textos, tipo, prazoMs).');
    if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) throw new TypeError('timeoutMs inválido');
    if (!Number.isInteger(maxCache) || maxCache < 1) throw new TypeError('maxCache inválido');
    this.#embed = embed; this.timeoutMs = timeoutMs; this.maxCache = maxCache;
  }
  async #vectors(texts, kind, timeoutMs) {
    if (!texts.length || texts.some(t => typeof t !== 'string' || !t.trim())) return null;
    const keys = texts.map(t => `${kind}\0${t}`);
    if (keys.every(k => this.#cache.has(k))) return keys.map(k => this.#cache.get(k));
    let timer;
    try {
      const vectors = await Promise.race([
        Promise.resolve().then(() => this.#embed(texts, kind, timeoutMs)),
        new Promise(resolve => { timer = setTimeout(() => resolve(null), timeoutMs); })
      ]);
      if (!validVectors(vectors, texts.length)) return null;
      const dimension = vectors[0].length;
      if (this.#dimension !== undefined && dimension !== this.#dimension) return null;
      this.#dimension = dimension;
      vectors.forEach((v, i) => this.#cache.set(keys[i], [...v]));
      while (this.#cache.size > this.maxCache) this.#cache.delete(this.#cache.keys().next().value);
      return vectors;
    } catch { return null; } finally { clearTimeout(timer); }
  }
  /** Indexes examples; does not modify neural network weights. Replaces this collection atomically. */
  async register(name, labels, { timeoutMs = 120000 } = {}) {
    if (typeof name !== 'string' || !name.trim() || !labels || typeof labels !== 'object') throw new TypeError('Coleção inválida');
    const entries = Object.entries(labels);
    if (entries.length < 2 || entries.some(([label, texts]) => !label || !Array.isArray(texts) || !texts.length || texts.some(t => typeof t !== 'string' || !t.trim()))) throw new TypeError('Use dois ou mais rótulos, cada um com exemplos de texto.');
    const examples = entries.flatMap(([label, texts]) => [...new Set(texts)].map(text => ({ label, text, learned: false })));
    const vectors = await this.#vectors(examples.map(e => e.text), 'passage', timeoutMs);
    if (!vectors) return abstain('Modelo indisponível, vetores inválidos ou prazo excedido.');
    this.#collections.set(name, { labels: new Set(entries.map(([l]) => l)), examples: examples.map((e,i) => ({ ...e, vector: vectors[i] })) });
    return { status: 'ready', collection: name, examples: examples.length };
  }
  async correct(collection, text, label) {
    const data = this.#collections.get(collection);
    if (!data?.labels.has(label) || typeof text !== 'string' || !text.trim()) throw new TypeError('Coleção, texto ou rótulo inválido.');
    text = text.replace(/\s+/g, ' ').trim().slice(0,1000);
    const vectors = await this.#vectors([text], 'passage', this.timeoutMs);
    if (!vectors) return abstain('Não foi possível indexar a correção.');
    const next = data.examples.filter(e => !(e.learned && e.text === text));
    next.push({ label, text, learned: true, vector: vectors[0] });
    const side = next.filter(e => e.learned && e.label === label);
    const remove = new Set(side.slice(0, Math.max(0, side.length - 40)));
    data.examples = next.filter(e => !remove.has(e));
    return { status: 'ready', collection };
  }
  exportCorrections() {
    return [...this.#collections].flatMap(([collection, data]) => data.examples.filter(e => e.learned).map(({ text, label }) => ({ collection, text, label })));
  }
  async classify(collection, text, { neighbors = 5, majority = .8 } = {}) {
    const data = this.#collections.get(collection);
    if (!data) return abstain('Coleção não preparada.');
    if (typeof text !== 'string' || !text.trim()) return abstain('Texto vazio.');
    if (!Number.isInteger(neighbors) || neighbors < 1 || !Number.isFinite(majority) || majority <= .5 || majority > 1) throw new TypeError('Vizinhos ou maioria inválidos.');
    text = text.replace(/\s+/g, ' ').trim().slice(0,1000);
    const exact = data.examples.findLast(e => e.learned && e.text === text);
    if (exact) return { status:'decided', label:exact.label, score:1, source:'correction', votes:{ [exact.label]:1 } };
    // An unambiguous supplied example is already labeled; do not overrule it with
    // query/passage embedding noise. Learned examples retain precedence.
    if (!data.examples.some(e => e.learned)) {
      const known = new Set(data.examples.filter(e => normalize(e.text) === normalize(text)).map(e => e.label));
      if (known.size === 1) {
        const label = [...known][0];
        return {status:'decided',label,score:1,source:'example',votes:{[label]:1}};
      }
    }
    const vectors = await this.#vectors([text], 'query', this.timeoutMs);
    if (!vectors) return abstain('Modelo indisponível ou prazo excedido.');
    const tally = contarVotos(data.examples.map(e => ({ rotulo:e.label, aprendido:e.learned, semelhanca:cosseno(vectors[0],e.vector) })), neighbors);
    const order = [...tally.votos].sort((a,b) => b[1]-a[1]);
    const [label, weight] = order[0] || [];
    const score = weight / Math.max(1,tally.total);
    if (!label || score < majority || order[1]?.[1] === weight) return { ...abstain('Sem maioria suficiente.'), votes:Object.fromEntries(tally.votos) };
    return { status:'decided', label, score, source:tally.identico ? 'correction' : 'neighbors', votes:Object.fromEntries(tally.votos) };
  }
  async prepare() {
    const results = {};
    const names = Object.keys(PERGUNTAS_DO_TURNO);
    for (const name of names) {
      const question = PERGUNTAS_DO_TURNO[name];
      const others = names.filter(n => n !== name).flatMap(n => PERGUNTAS_DO_TURNO[n].exemplosSim);
      results[name] = await this.register(name, { sim: question.exemplosSim, nao:[...new Set([...question.exemplosNao,...others])].filter(t => !question.exemplosSim.includes(t)) });
    }
    for (const [name, examples] of Object.entries({ commands:EXEMPLOS_DO_COMANDO, families:EXEMPLOS_DAS_FAMILIAS, risk:EXEMPLOS_DE_RISCO })) results[name] = await this.register(name, examples);
    return { status:Object.values(results).every(r=>r.status === 'ready') ? 'ready' : 'unavailable', collections:results };
  }
  async decide(text, previous = '') {
    if (typeof text !== 'string' || !text.trim() || typeof previous !== 'string') return abstain('Texto inválido.');
    const context = text.trim().split(/\s+/).length <= 5 && previous.trim() ? `${previous.trim().slice(0,300)} ${text.trim()}` : text.trim();
    const scores = {}, results = {};
    for (const name of Object.keys(PERGUNTAS_DO_TURNO)) {
      const r = await this.classify(name, context, { majority:.500001 });
      results[name] = r;
      // A tie/failed classification is uncertainty, never an implicit "no".
      if (r.status !== 'decided') return { ...abstain(`Sem decisão para ${name}.`), details:results };
      const total = Object.values(r.votes).reduce((a,b)=>a+b,0);
      scores[name] = (r.votes.sim || 0) / total;
    }
    const route = Object.fromEntries(Object.entries(LIMIAR).map(([key,limit])=>[key,scores[key]>=limit]));
    const proposal = candidatoAComando(text);
    let command = null;
    if (proposal) {
      const result = await this.classify('commands',limpar(text));
      if (result.status === 'decided' && result.label === proposal.acao) command = proposal;
    }
    if (command) {
      // A confirmed simple PC command has a known route; noisy independent votes must not
      // dispatch "open calculator" to a coding model. Compound requests never enter here.
      return { status:'decided', route:{programacao:false,pesquisa:false,acao:true}, scores, family:command.acao === 'abrir' ? 'pc' : 'midia', command, source:'confirmed-command', executed:false };
    }
    const family = await this.classify('families',context,{majority:.6});
    return { status:'decided', route, scores, family:family.status === 'decided' ? family.label : null, command, executed:false };
  }
  async risk(label) {
    if (typeof label !== 'string' || !label.trim()) return { status:'review', reason:'Alvo desconhecido.' };
    if (riskPattern.test(normalize(label))) return { status:'review', reason:'Ação potencialmente sensível.' };
    const result = await this.classify('risk', label,{majority:.6});
    return result.status === 'decided' && result.label === 'seguro'
      ? { status:'low-risk', score:result.score, authorization:false }
      : { status:'review', reason:'Risco ou incerteza: conferir antes de agir.' };
  }
  async select(description, candidates, { floor=.8, margin=.03 } = {}) {
    if (typeof description !== 'string' || !description.trim() || !Array.isArray(candidates) || !candidates.length || candidates.some(c => !c || typeof c.id !== 'string' || !c.id || typeof c.text !== 'string' || !c.text.trim()) || new Set(candidates.map(c=>c.id)).size !== candidates.length) return abstain('Candidatos inválidos.');
    const vectors = await this.#vectors([description,...candidates.map(c=>c.text)],'passage',this.timeoutMs);
    if (!vectors) return abstain('Não foi possível comparar os candidatos.');
    const ranked = candidates.map((c,i)=>({id:c.id,score:cosseno(vectors[0],vectors[i+1])})).sort((a,b)=>b.score-a.score);
    const best = ranked[0], second = ranked[1]?.score ?? 0;
    if (best.score < floor || best.score-second < margin) return abstain('Alvo ambíguo ou distante.');
    return { status:'decided', ...best, margin:best.score-second };
  }
  async selectElement(description, action, elements) {
    if (!['clicar','digitar'].includes(action) || !Array.isArray(elements)) return abstain('Ação ou elementos inválidos.');
    const candidates = candidatosPara(action, elements);
    const exact = escolhaExata(description,candidates);
    let selected = exact;
    if (!exact) {
      const r = await this.select(description,candidates.map(e=>({id:e.seletor,text:descreverElemento(e)})));
      if (r.status !== 'decided') return r;
      selected = candidates.find(e=>e.seletor === r.id);
    }
    if (!selected) return abstain('Nenhum alvo.');
    return { status:'decided', selector:selected.seletor, name:selected.nome, source:exact?'name':'semantic', risk:await this.risk(selected.nome), executed:false };
  }
}
