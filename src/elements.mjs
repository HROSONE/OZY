const normalizar = (t) => String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();

const TIPO_LEGIVEL                         = { a: 'link', button: 'botão', input: 'campo', textarea: 'campo de texto', select: 'lista de opções' };

/** "botão 'Entrar'", "campo (email) 'E-mail'" — o que o OZY e a busca por sentido comparam. */
export function descreverElemento(e) {
  const tipo = e.role === 'button' ? 'botão' : e.role === 'link' ? 'link' : e.role === 'checkbox' ? 'caixa de marcar' : TIPO_LEGIVEL[e.tag] || e.role || e.tag;
  const detalhe = e.tag === 'input' && e.tipo && !['text', 'submit', 'button'].includes(e.tipo) ? ` (${e.tipo})` : '';
  return `${tipo}${detalhe} "${e.nome || '(sem nome)'}"`;
}

const aceitaTexto = (e) =>
  e.tag === 'textarea' || e.role === 'textbox' || e.role === 'searchbox' || e.role === 'combobox'
  || (e.tag === 'input' && !['hidden', 'checkbox', 'radio', 'submit', 'button', 'reset', 'file', 'image', 'range', 'color'].includes(String(e.tipo || 'text')));

export function candidatosPara(acao, elementos) {
  return elementos.filter(e => !e.disabled && e.seletor && (acao === 'digitar' ? aceitaTexto(e) : true));
}

/** Nome igual à descrição (tirando "botão", "campo", aspas), e um só elemento com ele. */
export function escolhaExata(alvo, candidatos) {
  const procurado = normalizar(alvo).replace(/^(o |a )?(botao|link|campo|caixa|aba|menu|opcao|item) (de |do |da )?/, '').trim();
  if (!procurado) return null;
  const iguais = candidatos.filter(e => normalizar(e.nome) === procurado);
  if (iguais.length === 1) return iguais[0];
  if (iguais.length > 1) return null;
  const contendo = candidatos.filter(e => normalizar(e.nome).includes(procurado) && procurado.length >= 4);
  return contendo.length === 1 ? contendo[0] : null;
}

