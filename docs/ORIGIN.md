# Origem e limites

OZY 0.1.0 foi extraído do JEV **local** de HROSONE/OSONE-AI-code, commit `9411d75083ec1007cf0bb7911fb5ffa0b03d5144`.

| Origem no OSONE (`src/lib/`) | OZY |
| --- | --- |
| decisor/escolhaLocal.ts | src/voting.mjs e src/engine.mjs: cosseno, 5 vizinhos, correção quase idêntica, peso 2 |
| decisor/decisorLocal.ts | src/engine.mjs: perguntas independentes, contraexemplos cruzados, contexto curto |
| decisor/perguntasDoDecisor.ts | src/questions.mjs: exemplos e limiares |
| decisor/comandoDireto.ts | src/commands.mjs: extração de comandos reversíveis |
| decisor/familiasPeloSentido.ts | src/collections.mjs: famílias |
| cowork/guardaDoCowork.ts | src/collections.mjs: exemplos de risco |
| decisor/escolherElemento.ts | src/elements.mjs: candidatos e correspondência pelo nome |
| embeddings-locais-motor.mjs | src/runtime/motor.mjs |
| embeddings-locais-assets.mjs | src/runtime/assets.mjs |

O motor ONNX e o tokenizador do projeto de origem foram preservados. O gerenciamento de estado foi refeito por instância; não depende de React, Electron, Firebase, `/api/jev` ou contas do OSONE. O cosseno agora recusa dimensões incompatíveis e valores não finitos. A abstenção não vira autorização.

Nenhum peso proprietário, API, identidade comercial ou código interno da TypeSafe foi copiado. OZY não é o modelo JEV da TypeSafe. É um classificador por exemplos com embeddings pré-treinados, não um LLM novo treinado do zero.

O repositório original não contém uma licença de código na raiz. Esta extração foi solicitada pelo proprietário; nenhuma licença adicional foi presumida. Repositório público não concede automaticamente licença de redistribuição. O modelo de terceiros mantém sua própria licença (MIT, conforme manifesto de origem). Pesos não são incluídos no git.
