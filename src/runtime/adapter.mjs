/** Lazy import: core and tests do not require native libraries or download weights. */
export function createLocalEmbedder() {
  let motor;
  // Serialize inference to avoid overlapping native sessions under parallel callers.
  let queue = Promise.resolve();
  return (texts, kind) => {
    const work = queue.then(async () => {
      motor ||= await import('./motor.mjs');
      const result = [];
      for (let start=0; start<texts.length; start+=24) result.push(...await motor.gerarEmbeddingsLocais(texts.slice(start,start+24),{tipo:kind}));
      return result;
    });
    queue = work.catch(()=>{});
    return work;
  };
}
