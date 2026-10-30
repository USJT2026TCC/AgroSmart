import { ESCOPO, municipioNoEscopo } from "../../../../configuracao/escopo.js";
import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";

import { api } from "../../api/cliente";
import ProdutoDemonstracao from "../../componentes/ProdutoDemonstracao";
import { Aviso, Campo, Carregando, RodapeDaFronteira } from "../../componentes/ui";

const NOVA_PROPRIEDADE = "nova";
const TALHAO_INICIAL = { propriedadeId: "", propriedade: "", identificador: "", areaHa: "" };

const emHectares = (valor) =>
  `${Number(valor).toLocaleString("pt-BR", { maximumFractionDigits: 4 })} ha`;

/**
 * Talhoes do produtor fixo da demonstracao, em uma unica tela.
 *
 * Produto, produtor, cultura e municipio sao fixos, entao a seguradora so
 * informa o que muda de um talhao para outro: propriedade, nome e area.
 */
export default function TalhoesEProdutos() {
  const [talhoes, setTalhoes] = useState(null);
  const [produtos, setProdutos] = useState([]);
  const [produtor, setProdutor] = useState(null);
  const [propriedades, setPropriedades] = useState([]);
  const [novo, setNovo] = useState(TALHAO_INICIAL);
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState(null);
  const [aviso, setAviso] = useState(null);

  const carregar = useCallback(async () => {
    try {
      const [t, p, pr, pp] = await Promise.all([
        api("/talhoes"),
        api("/produtos"),
        api("/produtores"),
        api("/propriedades"),
      ]);
      const fixo = pr.produtores.find((x) => x.identificador === ESCOPO.produtor) ?? null;
      const doProdutor = pp.propriedades.filter(
        (x) => x.produtor_id === fixo?.id && municipioNoEscopo(x.municipio),
      );
      setTalhoes(t.talhoes);
      setProdutos(p.produtos.filter((x) => x.ativo !== false && x.cultura === ESCOPO.cultura));
      setProdutor(fixo);
      setPropriedades(doProdutor);
      setNovo((atual) => ({
        ...atual,
        propriedadeId: atual.propriedadeId || (doProdutor[0]?.id ?? NOVA_PROPRIEDADE),
      }));
    } catch (falha) {
      setErro(falha.message);
    }
  }, []);

  useEffect(() => {
    carregar();
  }, [carregar]);

  async function executar(acao, mensagem) {
    setErro(null);
    setAviso(null);
    setOcupado(true);
    try {
      await acao();
      setAviso(mensagem);
      await carregar();
      return true;
    } catch (falha) {
      setErro(falha.message);
      return false;
    } finally {
      setOcupado(false);
    }
  }

  async function salvarNovo(evento) {
    evento.preventDefault();
    if (ocupado || !produtor) return;
    const criandoPropriedade = novo.propriedadeId === NOVA_PROPRIEDADE;

    const salvou = await executar(
      () =>
        api("/talhoes", {
          metodo: "POST",
          corpo: {
            produtorId: produtor.id,
            identificador: novo.identificador.trim(),
            cultura: ESCOPO.cultura,
            areaHa: novo.areaHa,
            ...(criandoPropriedade
              ? { propriedade: { nome: novo.propriedade.trim(), municipio: ESCOPO.municipio } }
              : { propriedadeId: novo.propriedadeId }),
          },
        }),
      `Talhão ${novo.identificador.trim()} cadastrado. ${produtor.nome} já pode solicitar a proposta.`,
    );
    if (salvou) setNovo({ ...TALHAO_INICIAL, propriedadeId: novo.propriedadeId });
  }

  function remover(t) {
    if (!window.confirm(`Remover o talhão ${t.identificador}? Esta ação não pode ser desfeita.`))
      return;
    executar(
      () => api(`/talhoes/${t.id}`, { metodo: "DELETE" }),
      `Talhão ${t.identificador} removido.`,
    );
  }

  if (talhoes === null) {
    return (
      <div className="pagina">
        <h1>Talhões</h1>
        {erro ? (
          <>
            <Aviso tipo="erro">{erro}</Aviso>
            <button onClick={carregar}>Tentar novamente</button>
          </>
        ) : (
          <Carregando>Carregando cadastros…</Carregando>
        )}
      </div>
    );
  }

  const criandoPropriedade = novo.propriedadeId === NOVA_PROPRIEDADE;

  return (
    <div className="pagina cadastro-seguradora">
      <h1>Talhões</h1>
      <p className="silencioso">
        Cadastre os talhões de {produtor?.nome ?? "João Ribeiro"}. Depois que ele solicitar uma
        proposta, a análise e a emissão ficam em <Link to="/seguradora/propostas">Propostas</Link>.
      </p>

      <ProdutoDemonstracao produtos={produtos} />

      {erro && <Aviso tipo="erro">{erro}</Aviso>}
      {aviso && <Aviso tipo="sucesso">{aviso}</Aviso>}

      {!produtor ? (
        <Aviso tipo="erro">O produtor da demonstração não foi encontrado no banco.</Aviso>
      ) : (
        <form className="cartao" onSubmit={salvarNovo}>
          <h2>Novo talhão</h2>
          <p className="silencioso">
            Produtor {produtor.nome} · cultura soja · {ESCOPO.localidade}. Esses dados são fixos na
            demonstração.
          </p>

          <div className="grade">
            <Campo rotulo="Propriedade" htmlFor="propriedade">
              <select
                id="propriedade"
                value={novo.propriedadeId}
                onChange={(e) => setNovo({ ...novo, propriedadeId: e.target.value })}
              >
                {propriedades.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nome}
                  </option>
                ))}
                <option value={NOVA_PROPRIEDADE}>+ Nova propriedade</option>
              </select>
            </Campo>
            {criandoPropriedade ? (
              <Campo rotulo="Nome da nova propriedade" htmlFor="nome-propriedade">
                <input
                  id="nome-propriedade"
                  required
                  maxLength={120}
                  value={novo.propriedade}
                  onChange={(e) => setNovo({ ...novo, propriedade: e.target.value })}
                  placeholder="Fazenda Boa Vista"
                />
              </Campo>
            ) : null}
            <Campo
              rotulo="Identificação do talhão"
              htmlFor="identificador"
              ajuda="Sem acentos, até 31 caracteres."
            >
              <input
                id="identificador"
                required
                maxLength={31}
                pattern="[a-zA-Z0-9._ -]+"
                value={novo.identificador}
                onChange={(e) => setNovo({ ...novo, identificador: e.target.value })}
                placeholder="talhao-01"
              />
            </Campo>
            <Campo
              rotulo="Área (ha)"
              htmlFor="area"
              ajuda="Apenas cadastral: não muda a indenização."
            >
              <input
                id="area"
                required
                type="number"
                min="0.0001"
                step="0.0001"
                value={novo.areaHa}
                onChange={(e) => setNovo({ ...novo, areaHa: e.target.value })}
                placeholder="120"
              />
            </Campo>
          </div>

          <button type="submit" disabled={ocupado || produtos.length === 0}>
            {ocupado ? "Salvando…" : "Cadastrar talhão"}
          </button>
        </form>
      )}

      <section className="cartao tabela-rolavel">
        <h2>Talhões cadastrados ({talhoes.length})</h2>
        {talhoes.length === 0 ? (
          <p className="silencioso">Nenhum talhão ainda. Use o formulário acima.</p>
        ) : (
          <table className="tabela-empilhada">
            <thead>
              <tr>
                <th>Talhão</th>
                <th>Propriedade</th>
                <th>Cultura</th>
                <th className="numero">Área</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {talhoes.map((t) => (
                <tr key={t.id}>
                  <td data-rotulo="Talhão">{t.identificador}</td>
                  <td data-rotulo="Propriedade">{t.propriedade.nome}</td>
                  <td data-rotulo="Cultura">{t.cultura}</td>
                  <td data-rotulo="Área" className="numero">
                    {emHectares(t.areaHa)}
                  </td>
                  <td data-rotulo="">
                    <button
                      className="perigo pequeno"
                      disabled={ocupado}
                      onClick={() => remover(t)}
                    >
                      Remover
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <RodapeDaFronteira>
          Talhão com proposta ou apólice não pode ser removido: isso apagaria o que foi contratado.
        </RodapeDaFronteira>
      </section>
    </div>
  );
}
