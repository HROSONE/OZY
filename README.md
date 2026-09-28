# OZY

**Decisor local para agentes que trabalham no PC.** Extraído do JEV local do [OSONE-AI-code](https://github.com/HROSONE/OSONE-AI-code), independente da interface e das APIs do OSONE.

OZY recebe texto e candidatos estruturados, escolhe uma decisão e devolve JSON. Usa o motor local `multilingual-e5-small` + voto entre exemplos. Não é o JEV proprietário da TypeSafe, não é um LLM novo e não recebeu treinamento de pesos nesta versão.

## Começar no Windows ou Linux

Instale Node.js 22 ou 24 e Git. No terminal:

```sh
git clone https://github.com/HROSONE/OZY.git
cd OZY
npm install
npm test
npm run model:download
npm run smoke:model
npm start -- decide "OZY, abre a calculadora"
```

O download prepara o **modelo base já pré-treinado**, aproximadamente 118 MB de ONNX mais tokenizador. Os arquivos são verificados por SHA-256. Depois disso, as decisões rodam na CPU do PC, sem chave de API; o texto não vai para uma nuvem. `OZY_OFFLINE=1` impede downloads. `OZY_MODELS_DIR` permite mudar a pasta dos pesos. `OZY_EMBEDDING_THREADS` controla as threads da inferência (padrão 2; máximo 4).

A configuração `.npmrc` usa os binários de CPU já incluídos no pacote ONNX e evita baixar extras CUDA. OZY não precisa de GPU.

`npm test` não baixa modelos e não usa rede. A dependência nativa `onnxruntime-node` é opcional para usar o núcleo com outro vetorizador, mas é **necessária** para a inferência local padrão. Se o npm não conseguir instalá-la: `npm install onnxruntime-node@1.30.0` e confira o erro da plataforma.

## O que está pronto

| Capacidade | Comportamento |
| --- | --- |
| Decisão de turno | Sinaliza programação, pesquisa e ação no PC |
| Comando direto | Propõe abrir um alvo, volume ou mídia; recusa pedidos compostos |
| Família de ferramentas | Escolhe entre PC, código, web, documentos, mídia e outras famílias herdadas |
| Escolha entre candidatos | Compara apps, ferramentas ou outros itens fornecidos pelo agente |
| Alvo da interface | Escolhe seletor por nome ou semântica; descarta desabilitados e campos ocultos |
| Risco | Pede revisão diante de ações sensíveis, dúvida ou modelo indisponível |
| Correções | Recebe exemplos explícitos; mantém estado separado por instância |
| Perguntas tipadas | `evaluate` no formato Jev/Laya, com motor opcional e correção antes do modelo |
| Ciclo de agente | Observa, propõe, autoriza, executa e verifica por adaptadores do aplicativo hospedeiro |

**O CLI decide; ele não abre programas nem clica sozinho.** Para agir no PC, conecte o executor do seu agente aos adaptadores de `runAgent`. Esta versão não inclui captura de tela, visão, drivers de mouse/teclado ou um planejador geral. A biblioteca é a peça que escolhe; o executor é a peça que age.

## Perguntas tipadas: o formato do Jev e do Laya (novo na 0.2)

`ozy.evaluate(state, questions)` aceita as mesmas perguntas do [Jev](https://typesafe.ai) e do [Laya](https://github.com/NandhaKishorM/laya): `noul` (sim/não), `choice` (2 a 255 opções) e `score` (2 a 10 níveis). O mesmo código serve aos três motores.

```js
import { OZY, createLayaBackend } from './src/index.mjs';
import { createLocalEmbedder } from './src/runtime/adapter.mjs';

const ozy = new OZY({
  embed: createLocalEmbedder(),
  backend: createLayaBackend({ modelDir: './modelos/laya-multilingual' }), // opcional
  onDecision: d => console.log(d.question, d.source, d.ms)                  // opcional
});
const { answers } = await ozy.evaluate('Cobraram duas vezes, se não devolverem eu cancelo', {
  setor: { type: 'choice', instructions: 'Qual setor atende?', criteria: { cobranca: 'faturas e reembolsos', suporte: 'erros e falhas' } },
  cancelar: { type: 'noul', instructions: 'A pessoa ameaça cancelar?' }
});
// Errou? A correção vale na hora, antes de qualquer modelo, para o mesmo estado:
await ozy.correctAnswer('Cobraram duas vezes, se não devolverem eu cancelo', { type: 'noul', instructions: 'A pessoa ameaça cancelar?' }, { noul: 1 });
```

Cada pergunta é respondida nesta ordem: **correção da pessoa** (mesma pergunta, estado igual ou quase idêntico) → **motor** (Laya ou Jev, se configurado, numa chamada só e com prazo) → **voto local** (`choice` pela semelhança com as opções, só com folga; `noul`/`score`/`choice` pela coleção indicada em `question.collection`). Sem motor e sem coleção, uma pergunta aberta **se abstém** — o voto local não inventa. Resposta de motor fora das opções perguntadas é descartada; `minConfidence` transforma resposta insegura em abstenção.

Pela linha de comando: `npm start -- evaluate "texto" examples/perguntas.json [--laya PASTA]`.

### OZY, Jev e Laya

| | Jev (TypeSafe) | Laya (Convai, Apache 2.0) | OZY sem motor | OZY + Laya |
|---|---|---|---|---|
| Pergunta nova, sem exemplos | sim | sim | **não** (abstém) | sim |
| Aprende com correção, na hora | não | só com fine-tuning | sim | **sim** |
| Onde roda | nuvem, pago | no PC | no PC | no PC |
| Tamanho | — | 322M–421M parâmetros | 118 MB (e5-small) | os dois |

O voto entre exemplos sozinho **não** alcança Jev e Laya: ele compara com frases conhecidas, não entende a pergunta. A qualidade deles vem de modelos treinados para decidir. O OZY chega lá **usando o Laya como motor**, e acrescenta o que nenhum dos dois tem: a correção valendo antes do modelo. Os números do Laya são do [próprio projeto](https://github.com/NandhaKishorM/laya/blob/main/BENCHMARKS.md) (em português, sem fine-tuning, ~0,46 numa escolha entre 20 intenções); meça com seus casos antes de confiar.

**Instalar o motor Laya** (opcional): o pacote `laya-ts` ainda não está no npm. Clone `https://github.com/NandhaKishorM/laya`, instale a pasta `laya-ts` no projeto (`npm install ../laya/laya-ts`), exporte o checkpoint para ONNX com `laya-ts/scripts/export_onnx.py` e passe a pasta em `--laya` ou `OZY_LAYA_DIR`. Prefira `laya-multilingual` para português.

**Usar o Jev**: `createJevBackend({ apiKey })` ou `OZY_JEV_API_KEY` no CLI. O texto **sai do computador**; use só com consentimento.

## Usar como biblioteca

```js
import { OZY } from './src/index.mjs';
import { createLocalEmbedder } from './src/runtime/adapter.mjs';

const ozy = new OZY({ embed: createLocalEmbedder(), timeoutMs: 3000 });
const ready = await ozy.prepare();
if (ready.status !== 'ready') throw new Error('Modelo indisponível');
const decision = await ozy.decide('abre a calculadora');
console.log(decision); // executed: false

const app = await ozy.select('editor de código', [
  { id: 'vscode', text: 'Visual Studio Code, editor de código' },
  { id: 'calc', text: 'Calculadora' },
]);
console.log(app); // decided ou abstain; nunca inventa um id
```

O agente fornece somente candidatos realmente disponíveis. Uma decisão `abstain` deve pedir esclarecimento ou voltar ao planejador; não significa autorização nem "não". Os números `score`/`scores` são proporções de voto ou similaridades, **não probabilidades calibradas**. Classificar uma ação como `low-risk` também não a autoriza.

Veja [o exemplo de integração](examples/pc-agent.mjs), [a arquitetura](docs/ARCHITECTURE.md) e [a procedência do código](docs/ORIGIN.md).

## Treinamento: próxima etapa

Nenhum job de treino, GPU ou aprendizado automático está ligado. Há exemplos iniciais herdados do OSONE, mas **nenhuma conversa, memória, chave ou dataset pessoal** foi copiado.

Você pode depois reunir decisões corrigidas em JSONL, avaliar o conjunto e desenvolver seu treinamento. O formato e os comandos estão em [docs/TRAINING.md](docs/TRAINING.md). Indexar exemplos não altera os pesos do modelo. Um fine-tuning real ainda precisará de uma etapa própria.

## Verificação e limites

- `npm run check`: sintaxe de todos os módulos.
- `npm test`: contratos de decisão, correção, isolamento, timeout, ambiguidade e execução com evidência.
- `npm run smoke:model`: exige os pesos reais e verifica a inferência de embeddings.
- `npm run calibrate -- caminho.jsonl`: mede acertos e abstenções com o modelo real em exemplos rotulados.

Testes com vetores controlados não demonstram precisão semântica no PC. Os limiares herdados precisam ser calibrados com seus casos reais antes de aumentar a autonomia. O motor/tokenizador veio do OSONE; a seleção de alvos não substitui observar novamente uma interface que mudou.

## Licença

O código do OZY é distribuído sob a [Apache License 2.0](LICENSE) — a mesma do Laya. O modelo `multilingual-e5-small` mantém a licença dele (MIT) e os pesos não estão no git. Consulte [a origem dos componentes](docs/ORIGIN.md).
