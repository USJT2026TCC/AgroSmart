"use strict";
const { descreverErro } = require("./fila");

/** Um ciclo historico. A fila e retomada mesmo se a lista da API estiver indisponivel. */
async function executarCiclo(servico, informar = console.log) {
  let ativas = [];
  try {
    ativas = await servico.backend.apolicesAtivas();
  } catch (erro) {
    informar(`Backend indisponivel: ${erro.message}`);
  }
  if (!Array.isArray(ativas)) throw new Error("Lista de apolices invalida.");
  for (const a of ativas) {
    if (a.termos?.modoHistorico !== true) {
      informar(`${a.endereco}: apolice convencional ignorada pelo servico historico.`);
      continue;
    }
    try {
      const entrada = await servico.prepararHistorico(a.endereco);
      informar(`${a.endereco}: periodo historico ${entrada.periodo}, ${entrada.estado}`);
    } catch (erro) {
      informar(`${a.endereco}: ${descreverErro(erro)}`);
    }
  }
  return servico.drenarFila((evento) => {
    if (evento.tipo === "publicada")
      informar(`${evento.chave}: confirmada ${evento.recibo.txHash}`);
    if (evento.tipo === "erro") informar(`${evento.chave}: ${descreverErro(evento.erro)}`);
  });
}
module.exports = { executarCiclo };
