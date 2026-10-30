import { useCallback, useEffect, useRef, useState } from "react";

import { api } from "../../api/cliente";
import { useAtualizacaoAutomatica } from "../../api/atualizacaoAutomatica";
import { useCarteira } from "../../cadeia/CarteiraContexto";
import { useSessao } from "../../sessao/SessaoContexto";
import { emEth, mensagemDeErro } from "../../cadeia/formatos";
import { Aviso, Campo, LinkDaCadeia } from "../../componentes/ui";
import { implantacaoDaRede } from "../../cadeia/rede";

/**
 * Vinculo da carteira ao cadastro por assinatura (RF02, HU07).
 *
 * O desafio nasce no servidor, com numero unico e prazo de cinco minutos. A
 * carteira assina no navegador; o servidor recupera o endereco que assinou e so
 * grava o vinculo se ele for exatamente o endereco declarado. A chave privada nao
 * sai da carteira em nenhum momento (RNF15).
 */
export default function VincularCarteira() {
  const { usuario, recarregarUsuario } = useSessao();
  const {
    conta,
    temCarteira,
    conectar,
    conectando,
    redeCorreta,
    rede,
    trocarDeRede,
    signatario,
    provedorLeitura,
  } = useCarteira();

  const [saldo, setSaldo] = useState(null);
  const [recebido, setRecebido] = useState(null);
  const [erro, setErro] = useState(null);
  const [aviso, setAviso] = useState(null);
  const [assinando, setAssinando] = useState(false);
  const [ultimaMensagem, setUltimaMensagem] = useState(null);

  const consultaAtual = useRef(0);
  const carregar = useCallback(async () => {
    const consulta = ++consultaAtual.current;
    try {
      const [valor, { apolices }] = await Promise.all([
        conta ? provedorLeitura.getBalance(conta) : Promise.resolve(null),
        api("/apolices"),
      ]);
      if (consulta !== consultaAtual.current) return;
      setSaldo(valor);
      setRecebido({
        total: apolices.reduce((soma, a) => soma + BigInt(a.valorPagoWei ?? "0"), 0n),
        pagas: apolices.filter((a) => BigInt(a.valorPagoWei ?? "0") > 0n).length,
      });
    } catch {
      if (consulta === consultaAtual.current) {
        setSaldo(null);
        setRecebido(null);
      }
    }
  }, [conta, provedorLeitura, usuario?.carteira]);

  useEffect(() => {
    setSaldo(null);
    setRecebido(null);
    carregar();
    return () => {
      consultaAtual.current++;
    };
  }, [carregar]);
  useAtualizacaoAutomatica(carregar);

  async function vincular() {
    setErro(null);
    setAviso(null);
    setAssinando(true);

    try {
      const { desafioId, mensagem } = await api("/carteira/desafio", { metodo: "POST" });
      setUltimaMensagem(mensagem);

      const assinatura = await signatario.signMessage(mensagem);

      await api("/carteira/vincular", {
        metodo: "POST",
        corpo: { desafioId, endereco: conta, assinatura },
      });

      await recarregarUsuario();
      setAviso("Titularidade comprovada. A carteira foi vinculada ao seu cadastro.");
    } catch (falha) {
      setErro(falha.status ? falha.message : mensagemDeErro(falha));
    } finally {
      setAssinando(false);
    }
  }

  async function desvincular() {
    setErro(null);
    setAviso(null);

    try {
      await api("/carteira", { metodo: "DELETE" });
      await recarregarUsuario();
    } catch (falha) {
      setErro(falha.message);
    }
  }

  const vinculada = usuario?.carteira ?? null;
  const conectadaEhAVinculada =
    vinculada && conta && vinculada.toLowerCase() === conta.toLowerCase();

  // O contrato recusa apolice em que produtor e seguradora sao a mesma conta.
  const daSeguradora = (endereco) =>
    Boolean(endereco) && implantacaoDaRede()?.seguradora?.toLowerCase() === endereco.toLowerCase();

  return (
    <div className="pagina" style={{ maxWidth: 760 }}>
      <h1>Minha carteira</h1>
      <p className="silencioso">
        Esta carteira será usada nas novas propostas. Cada apólice já emitida mantém o beneficiário
        gravado no contrato, mesmo após trocar ou remover este vínculo.
      </p>

      {erro ? <Aviso tipo="erro">{erro}</Aviso> : null}
      {aviso ? <Aviso tipo="sucesso">{aviso}</Aviso> : null}

      <div className="cartao">
        <h2>Carteira vinculada ao cadastro</h2>

        {vinculada ? (
          <>
            <Campo rotulo="Endereço">
              <LinkDaCadeia valor={vinculada} tipo="address" curto={false} />
            </Campo>

            {daSeguradora(vinculada) ? (
              <Aviso tipo="erro" titulo="A carteira vinculada é a da seguradora.">
                O contrato não aceita produtor e seguradora com a mesma conta. Selecione outra conta
                na MetaMask e vincule-a abaixo.
              </Aviso>
            ) : null}

            {conta && !conectadaEhAVinculada ? (
              <Aviso tipo="alerta" titulo="A carteira conectada é outra.">
                Novas propostas usam o endereço vinculado acima. Apólices já emitidas mantêm seu
                beneficiário. Para trocar, assine o vinculo com a carteira nova.
              </Aviso>
            ) : null}

            <button className="perigo" onClick={desvincular}>
              Desvincular
            </button>
          </>
        ) : (
          <Aviso tipo="alerta">
            Nenhuma carteira vinculada. Sem ela não é possível enviar proposta: é para ela que a
            indenização é transferida.
          </Aviso>
        )}
      </div>

      <div className="cartao">
        <h2>Carteira conectada</h2>

        {!temCarteira ? (
          <Aviso tipo="alerta" titulo="Nenhuma carteira encontrada no navegador.">
            Instale a extensão MetaMask e recarregue a página.
          </Aviso>
        ) : !conta ? (
          <button onClick={conectar} disabled={conectando}>
            {conectando ? "Conectando…" : "Conectar carteira"}
          </button>
        ) : (
          <>
            <Campo rotulo="Endereço">
              <div className="mono">{conta}</div>
            </Campo>

            <Campo
              rotulo="Saldo da carteira"
              ajuda="Tudo o que esta conta tem na rede, de qualquer origem: o ETH de teste recebido de faucet ou de outra carteira, mais as indenizacoes. E o mesmo numero que a MetaMask mostra."
            >
              <div>{saldo === null ? "—" : emEth(saldo)}</div>
            </Campo>

            {recebido ? (
              <Campo
                rotulo="Indenizacoes ja recebidas pelo AgroSmart"
                ajuda="Soma dos pagamentos dos seus seguros aos beneficiarios fixados em cada apolice. Cada pagamento aparece tambem no detalhe da apolice, com o link da transacao."
              >
                <div>
                  {emEth(recebido.total)} em {recebido.pagas} apolice(s)
                </div>
              </Campo>
            ) : null}

            {!redeCorreta ? (
              <Aviso tipo="alerta" titulo="Carteira em outra rede.">
                <button className="secundario pequeno" onClick={trocarDeRede}>
                  Trocar para {rede.nome}
                </button>
              </Aviso>
            ) : null}

            {daSeguradora(conta) ? (
              <Aviso tipo="alerta" titulo="Esta conta é a da seguradora.">
                Para o produtor, selecione outra conta na MetaMask. A mesma conta nos dois papéis
                faz o contrato recusar a apólice.
              </Aviso>
            ) : !conectadaEhAVinculada ? (
              <>
                <p>
                  Assinar <strong>não</strong> movimenta valor, não custa gás e não autoriza nenhuma
                  transação: serve apenas para provar que você controla esse endereço.
                </p>

                <button onClick={vincular} disabled={assinando || !signatario}>
                  {assinando ? "Aguardando a carteira…" : "Assinar e vincular esta carteira"}
                </button>
              </>
            ) : (
              <Aviso tipo="sucesso">Esta é a carteira vinculada ao seu cadastro.</Aviso>
            )}

            {ultimaMensagem ? (
              <Campo
                rotulo="Ultima mensagem assinada"
                ajuda="Gerada pelo servidor. O numero unico impede que uma assinatura antiga seja reapresentada."
              >
                <textarea readOnly rows={6} value={ultimaMensagem} className="mono" />
              </Campo>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}
