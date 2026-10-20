"use strict";

/**
 * Cliente da API do backend, do ponto de vista do oraculo.
 *
 * O oraculo usa o backend para tres coisas:
 *   1. saber quais apolices estao ativas e a que talhao pertencem;
 *   2. buscar as leituras autenticadas na origem;
 *   3. relatar o que publicou, e o que nao conseguiu publicar.
 *
 * Autentica com a chave de servico no cabecalho `X-Chave-De-Servico`. Nao e a
 * chave privada do oraculo na cadeia — essa nunca sai desta maquina.
 *
 * O backend NAO e confiavel para o numero que vai para a cadeia: o oraculo
 * revalida as leituras com a mesma funcao de plausibilidade e consolida o indice
 * por conta propria. Quem assina e quem responde pelo numero.
 */
class ClienteBackend {
  /**
   * @param {object} opcoes
   * @param {string} opcoes.url Base da API, por exemplo http://localhost:3001/api
   * @param {string} opcoes.chave Chave de servico.
   * @param {number} [opcoes.timeoutMs=10000]
   */
  constructor({ url, chave, timeoutMs = 10_000 }) {
    if (!url) throw new Error("ClienteBackend exige a URL da API (API_URL).");
    if (!chave)
      throw new Error(
        "ClienteBackend exige a chave de servico (CHAVE_DE_SERVICO).",
      );

    this.url = url.replace(/\/$/, "");
    this.chave = chave;
    this.timeoutMs = timeoutMs;
  }

  async requisitar(metodo, caminho, corpo) {
    const resposta = await fetch(`${this.url}${caminho}`, {
      method: metodo,
      headers: {
        "X-Chave-De-Servico": this.chave,
        ...(corpo ? { "Content-Type": "application/json" } : {}),
      },
      body: corpo
        ? JSON.stringify(corpo, (_k, v) =>
            typeof v === "bigint" ? v.toString() : v,
          )
        : undefined,
      // Mesmo principio do publicador: falhar rapido, em vez de pendurar o
      // servico esperando uma API fora do ar.
      signal: AbortSignal.timeout(this.timeoutMs),
    });

    const dados = await resposta.json().catch(() => ({}));

    if (!resposta.ok) {
      const erro = new Error(
        dados?.erro?.mensagem || `API respondeu ${resposta.status}`,
      );
      erro.status = resposta.status;
      erro.codigo = dados?.erro?.codigo;
      throw erro;
    }

    return dados;
  }

  async apolicesAtivas() {
    return (await this.requisitar("GET", "/oraculo/apolices-ativas")).apolices;
  }

  /** Leituras do talhao, ja no formato que `consolidarIndiceClimatico` espera. */
  async leituras(talhao, ate, dias = 90) {
    const q = new URLSearchParams({
      talhao,
      ate: String(ate),
      dias: String(dias),
    });
    return (await this.requisitar("GET", `/oraculo/leituras?${q}`)).leituras;
  }

  serieHistorica(apolice) {
    return this.requisitar(
      "GET",
      `/oraculo/serie-historica?apolice=${encodeURIComponent(apolice)}`,
    );
  }

  relatarPublicacao(dados) {
    return this.requisitar("POST", "/oraculo/publicacoes", dados);
  }

  relatarFalha(dados) {
    return this.requisitar("POST", "/oraculo/falhas", dados);
  }
}

module.exports = { ClienteBackend };
