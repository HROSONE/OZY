// OZY: propostas, nunca relatos de ações já executadas.

const normalizar = (t) => String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim();

/** Vocativo e cortesia no começo e no fim não mudam o comando. É também o texto que se aprende. */
export const limpar = (t) => normalizar(t)
  .replace(/^(?:(?:ei|oi|ola|ozy|osone|jarvis)[,!\s]+)+/, '')
  .replace(/^(?:por favor|pf|pfv)[,\s]+/, '')
  .replace(/[,\s]+(?:por favor|pf|pfv|pra mim|para mim)$/, '')
  .replace(/[.!]+$/, '')
  .trim();

/** Nada de pergunta, condição, várias etapas ou propósito: aí é trabalho para o modelo. */
const COMPOSTO = /\?|\b(e depois|depois|entao|e (?:roda|abre|fecha|faz|cria|escreve|manda|clica|digita|procura|pesquisa|me)|quando|se |caso|pra |para |porque|como |que |qual |onde )\b|,/;

const ABRIR = /^(?:abre|abra|abrir|abri|inicia|inicie|iniciar|executa|execute|executar)\s+(?:o |a |os |as |meu |minha |o meu |a minha )?(.{2,40})$/;

/**
 * O formato, só pela regra. É o "código propõe": sem regra que case, nem se pergunta ao decisor.
 */
export function candidatoAComando(mensagem) {
  const t = limpar(mensagem);
  if (!t || t.split(' ').length > 8 || COMPOSTO.test(t)) return null;

  if (/^(?:aumenta|aumente|aumentar|sobe|suba|subir)\s+(?:o |um pouco o |mais o )?(?:volume|som)(?: um pouco)?$/.test(t)) return { acao: 'volume', subacao: 'up', descricao: 'aumentar o volume' };
  if (/^(?:abaixa|abaixe|abaixar|diminui|diminua|diminuir|baixa|baixe|baixar)\s+(?:o |um pouco o )?(?:volume|som)(?: um pouco)?$/.test(t)) return { acao: 'volume', subacao: 'down', descricao: 'abaixar o volume' };
  if (/^(?:muta|mute|silencia|silencie|tira o som|corta o som|deixa (?:no )?mudo|modo mudo)$/.test(t)) return { acao: 'volume', subacao: 'mute', descricao: 'silenciar o som' };
  if (/^(?:desmuta|desmute|volta o som|liga o som|tira do mudo)$/.test(t)) return { acao: 'volume', subacao: 'unmute', descricao: 'reativar o som' };

  if (/^(?:pausa|pause|pausar|despausa|continua|continue|da play|dá play|play|toca de novo)(?: (?:a |o )?(?:musica|video|som|spotify))?$/.test(t)) return { acao: 'midia', subacao: 'playpause', descricao: 'pausar/retomar a mídia' };
  if (/^(?:proxima|pula|pule|passa|avanca)(?: (?:a |essa )?(?:musica|faixa|video))?$/.test(t)) return { acao: 'midia', subacao: 'next', descricao: 'avançar para a próxima' };
  if (/^(?:volta|anterior|musica anterior|volta a musica|faixa anterior)(?: (?:a )?(?:musica|faixa))?$/.test(t) && !/^volta o som$/.test(t)) return { acao: 'midia', subacao: 'previous', descricao: 'voltar para a anterior' };

  const abrir = t.match(ABRIR);
  if (abrir) {
    const alvo = abrir[1].trim();
    // "abre uma empresa", "abre um arquivo" — artigo indefinido é conversa ou pedido vago.
    if (/^(um|uma|uns|umas|algum|alguma)\b/.test(alvo)) return null;
    return { acao: 'abrir', alvo, descricao: `abrir ${alvo}` };
  }
  return null;
}

/** Exemplos do voto local: o que É comando direto, e o que parece e não é. */
export const EXEMPLOS_DO_COMANDO                           = {
  abrir: ['abre o spotify', 'abre o vscode', 'abre a calculadora', 'inicia o chrome', 'abre o discord', 'abre minha pasta de downloads', 'executa o steam', 'abre o bloco de notas'],
  volume: ['aumenta o volume', 'abaixa o som', 'sobe o volume', 'diminui o volume', 'deixa no mudo', 'tira do mudo'],
  midia: ['pausa a música', 'próxima música', 'volta a música anterior', 'dá play', 'pula essa faixa', 'continua o vídeo'],
  nenhum: [
    'como eu abro um arquivo zip', 'o que abre primeiro, o mercado ou o banco', 'abre um parêntese aqui', 'abre o jogo pra mim e me explica as regras',
    'qual o melhor volume pra dormir', 'a música tá muito alta?', 'me recomenda uma música', 'abre o projeto e roda os testes',
    'bom dia', 'obrigado', 'me explica o que é o spotify', 'abre uma conta no banco'
  ]
};

