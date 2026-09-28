# Preparação para o treinamento futuro

O pedido desta versão é criar o OZY, sem iniciar treinamento. Não há fine-tuning implementado ou agendado, nem pesos OZY próprios. `prepare` apenas calcula vetores dos exemplos de partida.

## Dados

Uma linha JSON por exemplo corrigido:

```json
{"collection":"commands","text":"abra o editor","label":"abrir"}
```

Coleções iniciais: `programacao`, `pesquisa`, `acao` (rótulos `sim` e `nao`); `commands` (`abrir`, `volume`, `midia`, `nenhum`); `families` (rótulos de `src/collections.mjs`); `risk` (`irreversivel`, `seguro`).

`npm start -- record caminho.jsonl JSON` apenas grava dados, sem treinar. Arquivos JSONL pessoais em `data/` estão ignorados pelo git. Evite caminhos privados, credenciais e conteúdo de documentos; revise antes de publicar qualquer dataset.

## Correções em memória

Depois de preparar as coleções, chame `ozy.correct(collection, text, label)` e depois `ozy.exportCorrections()` para obter os registros. A persistência é explícita e controlada pelo aplicativo. Para restaurar, valide as linhas e aplique `correct` após `prepare`. Uma nova instância começa sem correções. Nunca aplique correções de um usuário em outro contexto.

## Avaliação antes do treino

Separe exemplos de treino e avaliação. Use frases novas, pedidos ambíguos, negações e ações que não deveriam acontecer. `npm run calibrate -- avaliacao.jsonl` mede a classificação real e conta abstenções; não aplica os exemplos como correções. O arquivo `data/example.jsonl` demonstra apenas o formato e não é um benchmark suficiente.

Para fine-tuning de pesos será preciso escolher objetivo/modelo treinável, criar divisões treino/validação/teste, rodar o treinamento e exportar um modelo compatível. O manifesto atual fixa hashes dos pesos base; uma exportação nova deve receber um novo manifesto e passar por avaliação. Não substitua pesos mantendo os hashes antigos.

## Correções das perguntas tipadas → fine-tuning do Laya

`ozy.exportAnswerCorrections()` devolve `{ type, instructions, text, answer }` para cada correção de `evaluate`. É o material que o [notebook de fine-tuning do Laya](https://github.com/NandhaKishorM/laya/blob/main/notebooks/laya_finetune_typed_decisions_2xT4_kaggle.ipynb) pede: estado, pergunta tipada e resposta certa. Segundo o próprio projeto, o fine-tuning no domínio é onde a precisão salta (0,362 → 0,766 no benchmark deles). Separe treino e avaliação, e nunca misture correções de pessoas diferentes sem consentimento.
