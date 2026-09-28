// Adaptado do JEV local do OSONE; procedência em docs/ORIGIN.md.
export const cosseno = (a          , b          ) => {
  if (!Array.isArray(a) || !Array.isArray(b) || !a.length || a.length !== b.length || ![...a, ...b].every(Number.isFinite)) return 0;
  let p = 0, aa = 0, bb = 0;
  for (let i = 0; i < a.length; i++) { p += a[i] * b[i]; aa += a[i] * a[i]; bb += b[i] * b[i]; }
  return aa && bb ? p / (Math.sqrt(aa) * Math.sqrt(bb)) : 0;
};

/** Acima disto, o aprendido é a MESMA frase (com outra pontuação ou acento) e decide sozinho. */
export const IDENTICO = 0.97;
/** O aprendido é a fala desta pessoa, não uma frase inventada: vale o dobro no voto. */
export const PESO_DO_APRENDIDO = 2;

                                                                                 

/**
 * A REGRA DO VOTO, EM UM LUGAR SÓ — usada pelo decisor do turno (`decisorLocal.ts`) e por todas as
 * coleções daqui. Duas cópias da mesma regra divergem no primeiro conserto feito só de um lado.
 *
 * O idêntico é procurado em TODOS os aprendidos, não só nos vizinhos: empatado com cinco exemplos
 * fixos, ele ficava fora do corte e a correção da pessoa nem entrava no voto.
 */
export function contarVotos(todos           , vizinhos        )                                                                   {
  const ordenados = [...todos].sort((a, b) => b.semelhanca - a.semelhanca);
  const identico = ordenados.find(v => v.aprendido && v.semelhanca >= IDENTICO);
  if (identico) return { identico: identico.rotulo, votos: new Map([[identico.rotulo, 1]]), total: 1 };
  const votos = new Map                ();
  let total = 0;
  for (const v of ordenados.slice(0, vizinhos)) {
    const peso = v.aprendido ? PESO_DO_APRENDIDO : 1;
    votos.set(v.rotulo, (votos.get(v.rotulo) || 0) + peso);
    total += peso;
  }
  return { votos, total };
}

