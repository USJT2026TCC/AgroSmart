import { useEffect, useState } from "react";

import { api } from "../api/cliente";
import { useCarteira } from "../cadeia/CarteiraContexto";
import { contratoRegistry } from "../cadeia/contratos";
import { emEth } from "../cadeia/formatos";
import { implantacaoDaRede } from "../cadeia/rede";
import { LinkDaCadeia, Selo } from "./ui";

/**
 * Tudo o que o painel mostra da blockchain, num cartao so: sincronizacao, saldo
 * da seguradora, oraculo autorizado e enderecos dos contratos para conferencia.
 *
 * Saldo e oraculo sao lidos pelo no publico, sem depender da MetaMask. A carteira
 * e o oraculo sao os do manifesto. `atualizacao` muda quando o painel recarrega.
 */
export default function ConexaoSepolia({
  pendentes = 0,
  atualizacao,
  semSincronizacao,
  publicacoes,
}) {
  const { provedorLeitura } = useCarteira();
  const implantacao = implantacaoDaRede();
  const seguradora = implantacao?.seguradora;
  const oraculo = implantacao?.oraculoAutorizado;

  const [saldo, setSaldo] = useState(null);
  const [garantia, setGarantia] = useState(null);
  const [oraculoAutorizado, setOraculoAutorizado] = useState(null);

  useEffect(() => {
    if (!implantacao) return undefined;
    let ativo = true;

    provedorLeitura
      .getBalance(seguradora)
      .then((valor) => ativo && setSaldo(valor))
      .catch(() => ativo && setSaldo(undefined));
    contratoRegistry(provedorLeitura)
      .ehAutorizado(oraculo)
      .then((sim) => ativo && setOraculoAutorizado(sim))
      .catch(() => ativo && setOraculoAutorizado(undefined));
    api("/produtos")
      .then(({ produtos }) => {
        const produto = produtos.find((p) => p.ativo !== false);
        if (ativo) setGarantia(produto ? BigInt(produto.valorIndenizacaoWei) : null);
      })
      .catch(() => {});

    return () => {
      ativo = false;
    };
  }, [implantacao, seguradora, oraculo, provedorLeitura, atualizacao]);

  if (!implantacao) return null;

  const cabem = typeof saldo === "bigint" && garantia ? saldo / garantia : null;
  const falta = cabem !== null && cabem < BigInt(Math.max(1, pendentes));

  return (
    <section className={`conexao-sepolia ${falta ? "atencao" : ""}`} aria-label="Blockchain">
      <div className="entre">
        <span className="conexao-titulo">
          <span
            className={`painel-ponto ${semSincronizacao ? "atencao" : ""}`}
            aria-hidden="true"
          />
          {semSincronizacao
            ? "Sincronização com a Sepolia indisponível"
            : "Sincronização com a Sepolia ativa"}
        </span>
        <span className="silencioso">Valores em ETH de teste</span>
      </div>

      <dl>
        <div>
          <dt>Saldo da seguradora</dt>
          <dd className="destaque">
            {saldo === undefined ? "indisponível" : saldo === null ? "…" : emEth(saldo)}
          </dd>
          <dd className="silencioso">
            {cabem === null
              ? "Usado para depositar as garantias."
              : falta
                ? `Não cobre ${Math.max(1, pendentes)} garantia(s) de ${emEth(garantia)}. Peça ETH de teste num faucet da Sepolia.`
                : `Dá para ${cabem.toString()} garantia(s) de ${emEth(garantia)}.`}
          </dd>
          <dd>
            <LinkDaCadeia valor={seguradora} tipo="address" />
          </dd>
        </div>
        <div>
          <dt>Oráculo</dt>
          <dd>
            {oraculoAutorizado === true ? (
              <Selo tipo="sucesso">autorizado</Selo>
            ) : oraculoAutorizado === false ? (
              <Selo tipo="erro">não autorizado</Selo>
            ) : (
              "…"
            )}
          </dd>
          <dd className="silencioso">Informa ao contrato os dias secos do INMET.</dd>
          <dd>
            <LinkDaCadeia valor={oraculo} tipo="address" />
          </dd>
        </div>
        <div>
          <dt>Fábrica de apólices</dt>
          <dd className="silencioso">Cria cada apólice.</dd>
          <dd>
            <LinkDaCadeia valor={implantacao.contratos.ApoliceFactory} tipo="address" />
          </dd>
        </div>
        <div>
          <dt>Registro de oráculos</dt>
          <dd className="silencioso">Guarda quem pode informar a chuva.</dd>
          <dd>
            <LinkDaCadeia valor={implantacao.contratos.OracleRegistry} tipo="address" />
          </dd>
        </div>
      </dl>
      <p className="silencioso">
        Os endereços abrem no Etherscan, para conferir fora do sistema cada apólice e cada
        pagamento.
      </p>
      {publicacoes?.total > 0 ? (
        <p className="silencioso">
          {publicacoes.total} publicação(ões) do oráculo confirmada(s)
          {publicacoes.latencia_media_ms == null
            ? "."
            : `, com latência média de ${publicacoes.latencia_media_ms} ms entre envio e confirmação.`}
        </p>
      ) : null}
    </section>
  );
}
