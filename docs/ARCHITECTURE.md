# Arquitetura

1. O aplicativo hospedeiro observa o estado atual (apps, arquivos, elementos, resultado anterior).
2. OZY compara o pedido com exemplos ou candidatos existentes.
3. A resposta estruturada indica decisão ou abstenção. OZY não gera comandos de terminal.
4. O hospedeiro decide se a ação foi autorizada e a executa pelo adaptador.
5. Uma conclusão só é aceita pelo `runAgent` quando o verificador retorna `ok: true` e evidência textual não vazia.

## Contratos

`new OZY({ embed, timeoutMs, maxCache })`: uma instância por usuário/contexto. O vetorizador recebe `(textos, 'query' | 'passage', prazoMs)` e deve devolver uma matriz de números finitos, não nulos, com dimensão estável. A implementação padrão é local e não envia texto para fora; se você fornecer outro adaptador, essa garantia depende dele.

- `prepare()`: indexa as coleções iniciais. O primeiro carregamento pode levar minutos. Não treina pesos.
- `decide(text, previous?)`: retorna `status`, `route`, `scores`, `family`, `command`, `executed: false`.
- `register(name, {label: ['exemplos']})`: substitui uma coleção explicitamente, sem estado global compartilhado.
- `classify(name, text, options?)`: exemplo exato e inequívoco antes do voto (quando não há correções); voto ponderado dos 5 vizinhos; maioria padrão de 80%.
- `correct(name, text, label)`: insere correção explícita. Correção quase idêntica (cosseno >= .97) tem precedência; demais correções pesam 2; até 40 por rótulo.
- `exportCorrections()`: devolve dados; não grava nem envia por conta própria.
- `select(description, candidates)`: id dos candidatos, piso .8 e margem .03; empate abstém.
- `selectElement(description, 'clicar' | 'digitar', elements)`: devolve seletor proposto e revisão de risco. Nenhum clique é feito.
- `risk(description)`: `review` ou `low-risk`, nunca autorização.
- `evaluate(state, questions, { minConfidence, signal })`: perguntas `noul`/`choice`/`score` no formato Jev/Laya (`src/typed.mjs`). Ordem: correção → `backend` → voto local. Nunca lança por falha de modelo (`backendError` explica); lança `TypeError` para pergunta malformada.
- `correctAnswer(state, question, answer)`: correção da resposta de uma pergunta tipada; vale para a mesma pergunta (tipo, instruções, opções) e estado igual ou com cosseno ≥ .97; até 40 por pergunta. `exportAnswerCorrections()` devolve os dados.
- `backend`: `createLayaBackend({ modelDir | agent })` (no PC, via `laya-ts`, carregado na primeira chamada) ou `createJevBackend({ apiKey })` (nuvem). Contrato: `predict(state, questions, { signal })` devolvendo `{ answers }` cru; o OZY normaliza (`score` em base 0, nível mais provável em `level`) e descarta o que não bate com a pergunta.
- `onDecision(d)`: chamado a cada resposta de `evaluate`, com `question`, `source` e `ms`; erro nele não derruba a decisão.

`runAgent` exige `observe`, `propose`, `authorize`, `execute`, `verify`. O limite padrão é 10 etapas; resultados do executor precisam de `ok: true`. Permissão exige o booleano `true`, e cópias dos objetos evitam que o autorizador mude silenciosamente a ação. Use os sinais de cancelamento nos adaptadores: uma chamada externa que ignore o sinal pode continuar pendente. OZY não é um sandbox de segurança.

O prazo do núcleo limita a espera pelo vetorizador. Uma inferência ONNX já em andamento pode terminar em segundo plano; o prazo não mata o processo nativo. Não abra ciclos de retries ilimitados após timeouts. O runtime serializa inferências.

## Organização

`src/voting.mjs`, `questions.mjs`, `commands.mjs`, `collections.mjs`, `elements.mjs`: lógica e exemplos extraídos.

`src/engine.mjs`: instâncias independentes, validação, cache, decisões e correções.

`src/runtime/`: motor ONNX e download com checksums, extraídos e renomeados para OZY.

`src/typed.mjs`: validação e normalização das perguntas tipadas; `src/backends.mjs`: adaptadores do Laya e do Jev.

`src/agent.mjs`: orquestração por adaptadores; `src/cli.mjs`: interface de terminal.

Não há servidor HTTP aberto, execução de shell ou telemetria. O projeto original não foi modificado.
