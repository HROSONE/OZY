                              
                                                           
                     
                                                                                            
                        
                                                                                          
                        
  


const CONVERSA = [
  'oi, tudo bem?',
  'bom dia!',
  'obrigado pela ajuda',
  'me conta uma piada',
  'o que você acha do amor?',
  'estou meio triste hoje',
  'qual o seu nome?',
  'explica de novo, não entendi',
  'me dá uma dica para dormir melhor',
  'o que significa a palavra efêmero?',
  'escreve um poema curto sobre o mar',
  'quem foi Machado de Assis?'
];

export const PERGUNTAS_DO_TURNO = {
  programacao: {
    instrucoes: 'A mensagem do usuário pede para escrever, corrigir, revisar, explicar ou executar código, ' +
      'criar um programa, site, aplicativo, jogo, script ou automação, ou resolver um erro de programação?',
    exemplosSim: [
      'cria um site para minha loja de roupas',
      'faz um jogo da cobrinha em javascript',
      'corrige esse erro: TypeError undefined is not a function',
      'escreve uma função em python que ordena uma lista',
      'monta um aplicativo de lista de tarefas',
      'por que meu código react está renderizando duas vezes?',
      'refatora esse componente para usar hooks',
      'cria uma API em node com login',
      'faz um script que renomeia os arquivos da pasta',
      'meu build está falhando no npm install',
      'explica o que esse trecho de código faz',
      'adiciona um botão de modo escuro no meu projeto'
    ],
    exemplosNao: [...CONVERSA, 'qual a previsão do tempo amanhã?', 'abre o spotify', 'manda uma mensagem pra minha mãe']
  },
  pesquisa: {
    instrucoes: 'A mensagem do usuário precisa de informação atual da internet para ser respondida ' +
      '(notícias, preços, cotações, clima, placares, lançamentos, fatos recentes ou um pedido para pesquisar)?',
    exemplosSim: [
      'quanto está o dólar hoje?',
      'qual a previsão do tempo para amanhã em São Paulo?',
      'quem ganhou o jogo do Flamengo ontem?',
      'quais as últimas notícias sobre a economia?',
      'pesquisa o preço do iPhone mais novo',
      'o que aconteceu hoje no mundo?',
      'qual o horário de funcionamento do shopping aqui perto?',
      'saiu algum lançamento novo de IA essa semana?',
      'quanto custa uma passagem para Lisboa agora?',
      'procura na internet como está o trânsito'
    ],
    exemplosNao: [...CONVERSA, 'cria um site para minha loja', 'abre a pasta de downloads', 'corrige esse erro no meu código']
  },
  acao: {
    instrucoes: 'A mensagem do usuário pede para agir no computador ou usar ferramentas e dados dele ' +
      '(abrir ou fechar programa, arquivos e pastas, tela, câmera, mensagens, WhatsApp, casa inteligente, ' +
      'lembretes, agenda, memória do assistente, criar imagem ou ler um link)?',
    exemplosSim: [
      'abre o spotify',
      'organiza minha pasta de downloads',
      'vê o que tem na minha tela',
      'manda uma mensagem no whatsapp pra Ana',
      'apaga a luz da sala',
      'me lembra de tomar remédio às 8',
      'lê esse link pra mim',
      'gera uma imagem de um gato astronauta',
      'lembra que meu aniversário é dia 3 de maio',
      'fecha o chrome',
      'vê se deu certo a instalação',
      'procura o arquivo do contrato no meu computador'
    ],
    exemplosNao: [...CONVERSA, 'quanto está o dólar hoje?', 'o que você acha dessa ideia?']
  }
}                                         ;

                                                             


                                                                         


export const LIMIAR = { programacao: 0.6, pesquisa: 0.6, acao: 0.35 }         ;

