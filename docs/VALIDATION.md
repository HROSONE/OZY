# Verificação da versão 0.1.0

Ambiente: Linux x64, Node.js 24.19.0, ONNX Runtime 1.30.0, CPU, modelo base Xenova/multilingual-e5-small com SHA-256 verificado. Nenhum treinamento de pesos foi executado.

- Instalação limpa com `npm ci`: passou, usando os binários CPU incluídos (sem extras CUDA).
- Sintaxe: passou. Testes de contrato: **19/19**.
- Inferência real: duas frases, vetores de 384 dimensões válidos.
- Preparação das seis coleções: cerca de 5,2 s neste ambiente, pesos já baixados.
- Sete decisões de demonstração: cerca de 5–13 ms após preparação; estes números não prometem latência no PC do usuário.

| Pedido | Resultado observado |
| --- | --- |
| OZY, abre a calculadora | ação, família PC, proposta de abrir calculadora |
| abaixa o volume | ação, mídia, proposta de diminuir volume |
| pausa a música | ação, mídia, proposta de play/pause |
| oi, tudo bem? | conversa; nenhum sinal de ação, código ou pesquisa |
| cria um script em python | programação |
| qual a previsão do tempo amanhã? | pesquisa |
| organiza minha pasta de downloads | ação; sem comando simples inventado |
| Esvaziar lixeira / Enviar mensagem | revisão |
| Próxima página | baixo risco; sem autorização implícita |
| editor de código, entre VS Code e calculadora | VS Code |

Amostra demonstrativa pequena, com sobreposição aos exemplos iniciais: **não é benchmark independente e não mede precisão geral**. A classificação de famílias ainda se abstém em parte dos pedidos. Candidatos ambíguos devem voltar ao agente hospedeiro. Nenhuma aplicação do PC foi aberta durante os testes.

Reproduza com `npm run validate:real` depois de baixar o modelo. Para avaliação independente, use `npm run calibrate -- avaliacao.jsonl`.
