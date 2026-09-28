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
| Ciclo de agente | Observa, propõe, autoriza, executa e verifica por adaptadores do aplicativo hospedeiro |

**O CLI decide; ele não abre programas nem clica sozinho.** Para agir no PC, conecte o executor do seu agente aos adaptadores de `runAgent`. Esta versão não inclui captura de tela, visão, drivers de mouse/teclado ou um planejador geral. A biblioteca é a peça que escolhe; o executor é a peça que age.

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

Público no GitHub; nenhuma nova licença de redistribuição foi atribuída ao código nesta extração. Consulte [a origem e os termos dos componentes](docs/ORIGIN.md).
