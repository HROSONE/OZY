import test from 'node:test';
import assert from 'node:assert/strict';
import { OZY, createLayaBackend, createJevBackend, validateQuestions } from '../src/index.mjs';

// Vetores controlados: conferem as REGRAS (ordem, validação, prazo), não a qualidade semântica.
const eixos = { alpha: [1, 0, 0], beta: [0, 1, 0], gamma: [0, 0, 1] };
const embed = async texts => texts.map(t => {
  const k = Object.keys(eixos).find(k => t.includes(k));
  return k ? eixos[k] : [.577, .577, .577];
});
const laya = answers => { let calls = 0; return { backend: { name: 'laya', escalaDoScore: 'zero', predict: async (s, q) => { calls++; return { answers: answers(q, s) }; } }, calls: () => calls }; };

const Q = {
  dept: { type: 'choice', instructions: 'Qual setor atende?', criteria: { billing: 'cobranças e reembolso', tech: 'erros e falhas' } },
  urg: { type: 'score', instructions: 'Quão urgente?', criteria: ['pode esperar', 'hoje', 'agora'] },
  cancel: { type: 'noul', instructions: 'Ameaça cancelar?' }
};

test('perguntas malformadas são recusadas como no Jev/Laya', () => {
  assert.throws(() => validateQuestions({ a: { type: 'choice', instructions: 'x', criteria: { so: 'uma' } } }));
  assert.throws(() => validateQuestions({ a: { type: 'score', instructions: 'x', criteria: ['um'] } }));
  assert.throws(() => validateQuestions({ a: { type: 'yesno', instructions: 'x' } }));
  assert.throws(() => validateQuestions({ a: { type: 'noul', instructions: ' ' } }));
  assert.deepEqual(validateQuestions(Q), ['dept', 'urg', 'cancel']);
});

test('com o Laya: uma chamada para todas as perguntas, respostas normalizadas', async () => {
  const m = laya(() => ({
    dept: { type: 'choice', choice: 'billing', probabilities: { billing: .9, tech: .1 }, confidence: .6, answer_confidence: .9 },
    urg: { type: 'score', score: 1.7, probabilities: { 0: .05, 1: .2, 2: .75 } },
    cancel: { type: 'noul', noul: .82, confidence: .82 }
  }));
  const o = new OZY({ embed, backend: m.backend });
  const r = await o.evaluate('cobraram duas vezes, vou cancelar', Q);
  assert.equal(m.calls(), 1);
  assert.equal(r.answers.dept.choice, 'billing');
  assert.equal(r.answers.dept.confidence, .9, 'answer_confidence tem precedência');
  assert.equal(r.answers.urg.score, 1.7);
  assert.equal(r.answers.urg.level, 2);
  assert.equal(r.answers.cancel.noul, .82);
  assert.equal(r.answers.cancel.source, 'laya');
});

test('NÃO INVENTA: escolha fora das opções, noul fora de [0,1] e score fora da escala são descartados', async () => {
  const m = laya(() => ({ dept: { choice: 'toString' }, urg: { score: 7 }, cancel: { noul: 1.4 } }));
  const r = await new OZY({ embed, backend: m.backend }).evaluate('texto neutro', Q);
  for (const id of ['urg', 'cancel']) assert.equal(r.answers[id].status, 'abstain', id);
  assert.notEqual(r.answers.dept.choice, 'toString');
});

test('a correção da pessoa vale antes do motor — e nem pergunta a ele', async () => {
  const m = laya(q => Object.fromEntries(Object.keys(q).map(id => [id, { noul: .95 }])));
  const o = new OZY({ embed, backend: m.backend });
  await o.correctAnswer('alpha reclamando do preço', Q.cancel, { noul: 0 });
  const r = await o.evaluate('alpha reclamando do preço', { cancel: Q.cancel });
  assert.equal(r.answers.cancel.noul, 0);
  assert.equal(r.answers.cancel.source, 'correction');
  assert.equal(m.calls(), 0);
  // Outra pergunta (instruções diferentes) não herda a correção.
  const outra = await o.evaluate('alpha reclamando do preço', { x: { type: 'noul', instructions: 'Está feliz?' } });
  assert.equal(outra.answers.x.source, 'laya');
  assert.deepEqual(o.exportAnswerCorrections().map(c => c.text), ['alpha reclamando do preço']);
});

test('correção vale para o estado quase idêntico (cosseno ≥ .97), não para qualquer um', async () => {
  const o = new OZY({ embed });
  await o.correctAnswer('alpha um', Q.dept, { choice: 'tech' });
  assert.equal((await o.evaluate('alpha dois', { dept: Q.dept })).answers.dept.choice, 'tech');
  assert.notEqual((await o.evaluate('beta', { dept: Q.dept })).answers.dept.source, 'correction');
  await assert.rejects(o.correctAnswer('alpha', Q.dept, { choice: 'inventada' }));
});

test('motor lento ou quebrado: prazo, e cai para o voto local sem lançar', async () => {
  const lento = { name: 'laya', predict: () => new Promise(() => {}) };
  const t = Date.now();
  const r = await new OZY({ embed, backend: lento, backendTimeoutMs: 50 }).evaluate('texto', { cancel: Q.cancel });
  assert.ok(Date.now() - t < 500);
  assert.equal(r.answers.cancel.status, 'abstain');
  assert.match(r.backendError, /50 ms/);
  const quebrado = { name: 'laya', predict: async () => { throw new Error('sem onnx'); } };
  assert.match((await new OZY({ embed, backend: quebrado }).evaluate('texto', { cancel: Q.cancel })).backendError, /sem onnx/);
});

test('minConfidence: abaixo do limiar, abstém (e marca low_confidence)', async () => {
  const m = laya(() => ({ cancel: { noul: .55, confidence: .55 } }));
  const r = await new OZY({ embed, backend: m.backend }).evaluate('x', { cancel: Q.cancel }, { minConfidence: .7 });
  assert.equal(r.answers.cancel.status, 'abstain');
  assert.equal(r.answers.cancel.low_confidence, true);
});

test('sem motor: choice pela semelhança com folga; pergunta aberta abstém em vez de inventar', async () => {
  const o = new OZY({ embed });
  const q = { d: { type: 'choice', instructions: 'Qual?', criteria: { a: 'alpha coisa', b: 'beta coisa' } }, n: Q.cancel };
  const r = await o.evaluate('alpha', q);
  assert.equal(r.answers.d.choice, 'a');
  assert.equal(r.answers.d.source, 'local');
  assert.equal(r.answers.n.status, 'abstain');
  assert.match(r.answers.n.reason, /pergunta aberta/);
});

test('sem motor: noul pela coleção indicada (sim/nao)', async () => {
  const o = new OZY({ embed });
  await o.register('golpe', { sim: ['alpha 1', 'alpha 2', 'alpha 3'], nao: ['beta 1', 'beta 2', 'beta 3'] });
  const r = await o.evaluate('alpha mensagem', { g: { type: 'noul', instructions: 'É golpe?', collection: 'golpe' } });
  assert.equal(r.answers.g.status, 'decided');
  assert.ok(r.answers.g.noul >= .6);
});

test('onDecision vê cada resposta; um erro nele não derruba a decisão', async () => {
  const vistas = [];
  const m = laya(() => ({ cancel: { noul: .3 } }));
  const o = new OZY({ embed, backend: m.backend, onDecision: d => { vistas.push(d); throw new Error('painel quebrado'); } });
  const r = await o.evaluate('x', { cancel: Q.cancel });
  assert.equal(r.answers.cancel.noul, .3);
  assert.equal(vistas[0].question, 'cancel');
  assert.equal(vistas[0].source, 'laya');
  assert.ok(Number.isFinite(vistas[0].ms));
});

test('adaptador do Laya: carrega o laya-ts uma vez só, e manda só type/instructions/criteria', async () => {
  let cargas = 0, recebidas;
  const falso = async () => ({ Agent: { load: async dir => { cargas++; assert.equal(dir, '/modelos/laya'); return { predict: async (s, q) => { recebidas = q; return { answers: {} }; } }; } } });
  const b = createLayaBackend({ modelDir: '/modelos/laya', importar: falso });
  await b.predict('s', { a: { ...Q.cancel, collection: 'x' } });
  await b.predict('s', { a: Q.cancel });
  assert.equal(cargas, 1);
  assert.deepEqual(recebidas.a, { type: 'noul', instructions: 'Ameaça cancelar?' });
  assert.throws(() => createLayaBackend({}));
});

test('adaptador do Jev: Bearer, corpo no formato da TypeSafe, score 1…n convertido', async () => {
  let pedido;
  const fetch = async (url, init) => { pedido = { url, init }; return new Response(JSON.stringify({ answers: { urg: { score: 3 } } }), { status: 200 }); };
  const o = new OZY({ embed, backend: createJevBackend({ apiKey: ' k ', fetch }) });
  const r = await o.evaluate('x', { urg: Q.urg });
  assert.equal(pedido.init.headers.Authorization, 'Bearer k');
  assert.equal(JSON.parse(pedido.init.body).model, 'jev-latest');
  assert.equal(r.answers.urg.score, 2, 'nota 3 de 3 do Jev vira o nível 2 (base 0)');
  const recusa = async () => new Response('{}', { status: 401 });
  const r2 = await new OZY({ embed, backend: createJevBackend({ apiKey: 'segredo', fetch: recusa }) }).evaluate('x', { urg: Q.urg });
  assert.match(r2.backendError, /recusou a chave/);
  assert.doesNotMatch(r2.backendError, /segredo/);
});

test('adaptador do Laya: falha ao carregar não fica guardada — a próxima chamada tenta de novo', async () => {
  let tentativas = 0;
  const importar = async () => ({ Agent: { load: async () => { if (++tentativas === 1) throw new Error('laya-ts ausente'); return { predict: async () => ({ answers: {} }) }; } } });
  const b = createLayaBackend({ modelDir: '/m', importar });
  await assert.rejects(b.predict('s', { a: Q.cancel }), /ausente/);
  await b.predict('s', { a: Q.cancel });
  assert.equal(tentativas, 2);
});

test('adaptador do Laya: sem o laya-ts, a mensagem diz o que instalar', async () => {
  const importar = async () => { const e = new Error("Cannot find package 'laya-ts'"); e.code = 'ERR_MODULE_NOT_FOUND'; throw e; };
  await assert.rejects(createLayaBackend({ modelDir: '/m', importar }).predict('s', { a: Q.cancel }), /laya-ts não está instalado.*NandhaKishorM\/laya/);
});
