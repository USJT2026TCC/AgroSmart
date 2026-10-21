import { useCallback, useEffect, useState } from "react";

import { api } from "../../api/cliente";
import { mascararDocumento, problemaDoDocumento } from "../../cadastro/documento";
import { MODO_PAGAMENTO, condicaoEmPalavras } from "../../cadeia/regraDeGatilho";
import { Aviso, Campo, Carregando, RodapeDaFronteira } from "../../componentes/ui";
import { Link } from "react-router-dom";

const PRODUTOR_INICIAL = { identificador: "", nome: "", documento: "", senhaInicial: "" };

const PRODUTO_INICIAL = {
  nome: "",
  cultura: "soja",
  modoPagamento: MODO_PAGAMENTO.INTEGRAL,
  limiarClimatico: 30,
  limiarClimaticoIntegral: 0,
  valorPorHectareEth: "0.006",
  vigenciaDias: 180,
  taxaPremioPct: "4.5",
};

/** Termos do produto como o contrato espera. */
function termosDoFormulario(p) {
  return {
    modoPagamento: MODO_PAGAMENTO.INTEGRAL,
    limiarClimatico: Number(p.limiarClimatico),
    limiarClimaticoIntegral: 0,
  };
}

export default function TalhoesEProdutos() {
  const [aba, setAba] = useState("cadastro");
  const [etapa, setEtapa] = useState(1);
  const [novo, setNovo] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const [talhoes, setTalhoes] = useState(null);
  const [produtos, setProdutos] = useState([]);
  const [produtores, setProdutores] = useState([]);
  const [propriedades, setPropriedades] = useState([]);
  const [novoProdutor, setNovoProdutor] = useState(PRODUTOR_INICIAL);
  const [editandoTalhao, setEditandoTalhao] = useState(null);
  const [edicoes, setEdicoes] = useState({});
  const [erro, setErro] = useState(null);
  const [aviso, setAviso] = useState(null);

  const [talhao, setTalhao] = useState({
    produtorId: "",
    identificador: "",
    propriedade: "",
    municipio: "",
    cultura: "soja",
    areaHa: "",
    propriedadeId: "",
  });

  const [produto, setProduto] = useState(PRODUTO_INICIAL);

  const carregar = useCallback(async () => {
    try {
      const [t, p, pr, pp] = await Promise.all([
        api("/talhoes"),
        api("/produtos"),
        api("/produtores"),
        api("/propriedades"),
      ]);
      setTalhoes(t.talhoes);
      setProdutos(p.produtos);
      setProdutores(pr.produtores);
      setPropriedades(pp.propriedades);
      setTalhao((atual) => ({
        ...atual,
        produtorId: atual.produtorId || pr.produtores[0]?.id || "",
      }));
    } catch (falha) {
      setErro(falha.message);
    }
  }, []);

  useEffect(() => {
    carregar();
  }, [carregar]);

  async function gravarTalhao(evento) {
    evento.preventDefault();
    if (ocupado) return;
    setErro(null);
    setAviso(null);

    setOcupado(true);
    try {
      const { talhao: criado } = await api("/talhoes", {
        metodo: "POST",
        corpo: {
          produtorId: talhao.produtorId,
          identificador: talhao.identificador,
          cultura: talhao.cultura,
          propriedade: { nome: talhao.propriedade, municipio: talhao.municipio },
          areaHa: talhao.areaHa,
          ...(talhao.propriedadeId ? { propriedadeId: talhao.propriedadeId } : {}),
        },
      });

      setAviso(
        `Talhao ${criado.identificador} salvo. Área informada: ${Number(criado.areaHa).toFixed(2)} ha.`,
      );
      setTalhao({ ...talhao, identificador: "", areaHa: "" });
      setEtapa(1);
      setAba("registros");
      await carregar();
    } catch (falha) {
      setErro(falha.message);
    } finally {
      setOcupado(false);
    }
  }

  async function cadastrarProdutor(evento) {
    evento.preventDefault();
    if (ocupado) return;
    setErro(null);
    setAviso(null);

    const problema = problemaDoDocumento(novoProdutor.documento);
    if (problema) {
      setErro(problema);
      return;
    }

    setOcupado(true);
    try {
      const { produtor } = await api("/produtores", { metodo: "POST", corpo: novoProdutor });
      setAviso(
        `Produtor ${produtor.nome} cadastrado. Entregue a senha inicial a ele por um canal seguro.`,
      );
      setNovoProdutor(PRODUTOR_INICIAL);
      setTalhao((t) => ({ ...t, produtorId: produtor.id, propriedadeId: "", propriedade: "" }));
      setNovo(false);
      setEtapa(2);
      await carregar();
    } catch (falha) {
      setErro(falha.message);
    } finally {
      setOcupado(false);
    }
  }

  /** Grava a edicao de um produtor ou de uma propriedade (RF03). */
  async function salvarEdicao(tipo, id) {
    setErro(null);
    setAviso(null);

    try {
      await api(`/${tipo}/${id}`, { metodo: "PATCH", corpo: edicoes[`${tipo}:${id}`] ?? {} });
      setAviso("Alteracao salva.");
      setEdicoes({ ...edicoes, [`${tipo}:${id}`]: undefined });
      await carregar();
    } catch (falha) {
      setErro(falha.message);
    }
  }

  const editar = (tipo, id, campo) => (e) =>
    setEdicoes({
      ...edicoes,
      [`${tipo}:${id}`]: { ...(edicoes[`${tipo}:${id}`] ?? {}), [campo]: e.target.value },
    });

  async function salvarTalhaoEditado() {
    setErro(null);
    setAviso(null);

    try {
      const { talhao: salvo } = await api(`/talhoes/${editandoTalhao.id}`, {
        metodo: "PATCH",
        corpo: {
          cultura: editandoTalhao.cultura,
          ...(Number(editandoTalhao.areaHa) !==
          Number(talhoes.find((t) => t.id === editandoTalhao.id)?.areaHa)
            ? { areaHa: editandoTalhao.areaHa }
            : {}),
        },
      });
      setAviso(
        `Talhao ${salvo.identificador} atualizado. Area: ${Number(salvo.areaHa).toFixed(2)} ha.`,
      );
      setEditandoTalhao(null);
      await carregar();
    } catch (falha) {
      setErro(falha.message);
    }
  }

  async function removerTalhao(id) {
    setErro(null);
    try {
      await api(`/talhoes/${id}`, { metodo: "DELETE" });
      await carregar();
    } catch (falha) {
      setErro(falha.message);
    }
  }

  async function gravarProduto(evento) {
    evento.preventDefault();
    if (ocupado) return;
    setErro(null);
    setAviso(null);

    setOcupado(true);
    try {
      const { produto: criado } = await api("/produtos", {
        metodo: "POST",
        corpo: {
          nome: produto.nome,
          cultura: produto.cultura,
          valorPorHectareEth: produto.valorPorHectareEth,
          taxaPremioPct: produto.taxaPremioPct,
          vigenciaDias: Number(produto.vigenciaDias),
          ...termosDoFormulario(produto),
        },
      });

      setAviso(`Produto ${criado.nome} disponivel para contratacao.`);
      setProduto({ ...produto, nome: "" });
      await carregar();
    } catch (falha) {
      setErro(falha.message);
    } finally {
      setOcupado(false);
    }
  }

  async function retirarProduto(id) {
    setErro(null);
    try {
      await api(`/produtos/${id}`, { metodo: "DELETE" });
      await carregar();
    } catch (falha) {
      setErro(falha.message);
    }
  }

  const selecionado = produtores.find((p) => p.id === talhao.produtorId);
  const propriedadeSelecionada = propriedades.find((p) => p.id === talhao.propriedadeId);
  const opcoesCultura = (
    <>
      <option value="soja">Soja</option>
      <option value="milho">Milho</option>
      <option value="cafe">Café</option>
      <option value="cana">Cana-de-açúcar</option>
    </>
  );
  return (
    <div className="pagina cadastro-seguradora">
      <h1>Cadastros da seguradora</h1>
      <p className="silencioso">Organize o produtor e sua área antes da contratação do seguro.</p>
      <nav className="abas-cadastro" aria-label="Cadastros da seguradora">
        {[
          ["cadastro", "Cadastrar talhão"],
          ["produtos", "Produtos de seguro"],
          ["registros", "Consultar e editar"],
        ].map(([id, titulo]) => (
          <button
            key={id}
            type="button"
            className={aba === id ? "" : "secundario"}
            aria-pressed={aba === id}
            onClick={() => {
              setAba(id);
              setErro(null);
            }}
          >
            {titulo}
          </button>
        ))}
      </nav>
      {erro && <Aviso tipo="erro">{erro}</Aviso>}
      {aviso && <Aviso tipo="sucesso">{aviso}</Aviso>}
      {talhoes === null ? (
        <>
          <Carregando>Carregando cadastros…</Carregando>
          {erro && <button onClick={carregar}>Tentar novamente</button>}
        </>
      ) : (
        <>
          {aba === "cadastro" && (
            <>
              <ol className="etapas-cadastro" aria-label="Etapas do cadastro">
                {["Produtor", "Propriedade e plantação", "Conferência"].map((titulo, i) => (
                  <li key={titulo} aria-current={etapa === i + 1 ? "step" : undefined}>
                    <span>{i + 1}</span>
                    <strong>{titulo}</strong>
                  </li>
                ))}
              </ol>
              {etapa === 1 && (
                <>
                  <section className="cartao">
                    <h2>1. Quem é o produtor?</h2>
                    <div className="linha-de-botoes">
                      <button
                        type="button"
                        className={!novo ? "" : "secundario"}
                        aria-pressed={!novo}
                        onClick={() => setNovo(false)}
                      >
                        Selecionar cadastrado
                      </button>
                      <button
                        type="button"
                        className={novo ? "" : "secundario"}
                        aria-pressed={novo}
                        onClick={() => setNovo(true)}
                      >
                        Novo produtor
                      </button>
                    </div>
                    {!novo && (
                      <>
                        <Campo rotulo="Produtor cadastrado" htmlFor="produtor">
                          <select
                            id="produtor"
                            value={talhao.produtorId}
                            onChange={(e) =>
                              setTalhao({
                                ...talhao,
                                produtorId: e.target.value,
                                propriedadeId: "",
                                propriedade: "",
                                municipio: "",
                              })
                            }
                          >
                            <option value="">Selecione um produtor</option>
                            {produtores.map((p) => (
                              <option key={p.id} value={p.id}>
                                {p.nome} ({p.identificador})
                              </option>
                            ))}
                          </select>
                        </Campo>
                        {!produtores.length && (
                          <p>Nenhum produtor cadastrado. Use “Novo produtor”.</p>
                        )}
                        <button
                          disabled={!selecionado}
                          onClick={() => {
                            setErro(null);
                            setEtapa(2);
                          }}
                        >
                          Continuar para o talhão
                        </button>
                      </>
                    )}
                  </section>
                  {novo && (
                    <form className="cartao" onSubmit={cadastrarProdutor}>
                      <h2>Cadastrar produtor</h2>
                      <div className="grade">
                        <Campo rotulo="Identificador de acesso" htmlFor="novo-identificador">
                          <input
                            id="novo-identificador"
                            required
                            minLength={3}
                            maxLength={60}
                            pattern="[a-z0-9._-]+"
                            value={novoProdutor.identificador}
                            onChange={(e) =>
                              setNovoProdutor({ ...novoProdutor, identificador: e.target.value })
                            }
                            placeholder="maria.silva"
                          />
                        </Campo>
                        <Campo rotulo="Nome" htmlFor="novo-nome">
                          <input
                            id="novo-nome"
                            required
                            value={novoProdutor.nome}
                            onChange={(e) =>
                              setNovoProdutor({ ...novoProdutor, nome: e.target.value })
                            }
                          />
                        </Campo>
                        <Campo
                          rotulo="CPF ou CNPJ"
                          htmlFor="novo-documento"
                          ajuda={
                            novoProdutor.documento.replace(/\D/g, "").length >= 11
                              ? (problemaDoDocumento(novoProdutor.documento) ?? "Documento valido.")
                              : "Opcional. Os digitos verificadores sao conferidos."
                          }
                        >
                          <input
                            id="novo-documento"
                            inputMode="numeric"
                            placeholder="000.000.000-00"
                            value={novoProdutor.documento}
                            onChange={(e) =>
                              setNovoProdutor({
                                ...novoProdutor,
                                documento: mascararDocumento(e.target.value),
                              })
                            }
                          />
                        </Campo>
                        <Campo
                          rotulo="Senha inicial"
                          htmlFor="novo-senha"
                          ajuda="Ao menos 10 caracteres. Entregue a senha ao produtor por um canal seguro."
                        >
                          <input
                            id="novo-senha"
                            required
                            minLength={10}
                            type="password"
                            autoComplete="new-password"
                            value={novoProdutor.senhaInicial}
                            onChange={(e) =>
                              setNovoProdutor({ ...novoProdutor, senhaInicial: e.target.value })
                            }
                          />
                        </Campo>
                      </div>
                      <button type="submit" disabled={ocupado}>
                        Cadastrar e continuar
                      </button>
                    </form>
                  )}
                </>
              )}
              {etapa === 2 && (
                <form
                  className="cartao"
                  onSubmit={(e) => {
                    e.preventDefault();
                    setErro(null);
                    setEtapa(3);
                  }}
                >
                  <h2>2. Propriedade, talhão e plantação</h2>
                  <p>
                    Produtor: <strong>{selecionado?.nome}</strong>
                  </p>
                  <Campo rotulo="Propriedade" htmlFor="propriedade-existente">
                    <select
                      id="propriedade-existente"
                      value={talhao.propriedadeId}
                      onChange={(e) => setTalhao({ ...talhao, propriedadeId: e.target.value })}
                    >
                      <option value="">Cadastrar nova propriedade</option>
                      {propriedades
                        .filter((p) => p.produtor_id === talhao.produtorId)
                        .map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.nome} — {p.municipio}
                          </option>
                        ))}
                    </select>
                  </Campo>
                  {!talhao.propriedadeId && (
                    <div className="grade">
                      <Campo rotulo="Nome da propriedade" htmlFor="propriedade">
                        <input
                          id="propriedade"
                          required
                          maxLength={120}
                          value={talhao.propriedade}
                          onChange={(e) => setTalhao({ ...talhao, propriedade: e.target.value })}
                          placeholder="Fazenda Santa Clara"
                        />
                      </Campo>
                      <Campo rotulo="Município / UF" htmlFor="municipio">
                        <input
                          id="municipio"
                          required
                          maxLength={120}
                          value={talhao.municipio}
                          onChange={(e) => setTalhao({ ...talhao, municipio: e.target.value })}
                          placeholder="São Simão/SP"
                        />
                      </Campo>
                    </div>
                  )}
                  <div className="grade">
                    <Campo
                      rotulo="Identificação do talhão"
                      htmlFor="identificador"
                      ajuda="Nome curto, sem acentos, de até 31 caracteres."
                    >
                      <input
                        id="identificador"
                        required
                        maxLength={31}
                        pattern="[a-zA-Z0-9._-]+"
                        value={talhao.identificador}
                        onChange={(e) => setTalhao({ ...talhao, identificador: e.target.value })}
                        placeholder="talhao-01"
                      />
                    </Campo>
                    <Campo
                      rotulo="Área do talhão (ha)"
                      htmlFor="area-talhao"
                      ajuda="1 hectare equivale a 10.000 m². Informe até 4 casas decimais."
                    >
                      <input
                        id="area-talhao"
                        required
                        type="number"
                        min="0.0001"
                        max="9999999999.9999"
                        step="0.0001"
                        value={talhao.areaHa}
                        onChange={(e) => setTalhao({ ...talhao, areaHa: e.target.value })}
                        placeholder="Ex.: 12,5"
                      />
                    </Campo>
                    <Campo rotulo="Cultura plantada" htmlFor="cultura-talhao">
                      <select
                        id="cultura-talhao"
                        value={talhao.cultura}
                        onChange={(e) => setTalhao({ ...talhao, cultura: e.target.value })}
                      >
                        {opcoesCultura}
                      </select>
                    </Campo>
                  </div>
                  <Aviso>
                    Área declarada pela seguradora, sem medição geográfica. Para a demonstração, o
                    talhão é fictício e utiliza os dados históricos da estação A770, São Simão/SP,
                    independentemente do município cadastrado.
                  </Aviso>
                  <div className="linha-de-botoes">
                    <button type="button" className="secundario" onClick={() => setEtapa(1)}>
                      Voltar
                    </button>
                    <button type="submit">Conferir cadastro</button>
                  </div>
                </form>
              )}
              {etapa === 3 && (
                <form className="cartao" onSubmit={gravarTalhao}>
                  <h2>3. Confira antes de salvar</h2>
                  <dl className="resumo-cadastro">
                    <dt>Produtor</dt>
                    <dd>{selecionado?.nome}</dd>
                    <dt>Propriedade</dt>
                    <dd>{propriedadeSelecionada?.nome || talhao.propriedade}</dd>
                    <dt>Município</dt>
                    <dd>{propriedadeSelecionada?.municipio || talhao.municipio}</dd>
                    <dt>Talhão</dt>
                    <dd>{talhao.identificador}</dd>
                    <dt>Área informada</dt>
                    <dd>
                      {Number(talhao.areaHa).toLocaleString("pt-BR", { maximumFractionDigits: 4 })}{" "}
                      ha
                    </dd>
                    <dt>Cultura</dt>
                    <dd>{talhao.cultura}</dd>
                  </dl>
                  <p className="silencioso">
                    Este cadastro não emite apólice nem movimenta a carteira. O produtor poderá
                    cotar um produto da mesma cultura.
                  </p>
                  <div className="linha-de-botoes">
                    <button
                      type="button"
                      className="secundario"
                      disabled={ocupado}
                      onClick={() => setEtapa(2)}
                    >
                      Voltar e corrigir
                    </button>
                    <button disabled={ocupado}>
                      {ocupado ? "Salvando…" : "Confirmar cadastro do talhão"}
                    </button>
                  </div>
                </form>
              )}
            </>
          )}
          {aba === "produtos" && (
            <>
              <p>
                O produto define as condições oferecidas para uma cultura. Ele pode atender vários
                talhões; não é uma apólice.
              </p>
              <form className="cartao" onSubmit={gravarProduto}>
                <h2>Novo produto de seguro</h2>

                <Campo rotulo="Nome" htmlFor="nome-produto">
                  <input
                    id="nome-produto"
                    required
                    value={produto.nome}
                    onChange={(e) => setProduto({ ...produto, nome: e.target.value })}
                    placeholder="Estiagem — cafe"
                  />
                </Campo>

                <div className="grade">
                  <Campo rotulo="Cultura" htmlFor="cultura-produto">
                    <select
                      id="cultura-produto"
                      value={produto.cultura}
                      onChange={(e) => setProduto({ ...produto, cultura: e.target.value })}
                    >
                      <option value="soja">soja</option>
                      <option value="milho">milho</option>
                      <option value="cafe">cafe</option>
                      <option value="cana">cana</option>
                    </select>
                  </Campo>

                  <p>
                    Indenizacao integral em parcela unica. Gatilho experimental de estiagem, sem
                    calibracao por cultura, solo ou fase da safra.
                  </p>

                  <Campo rotulo="Aciona com quantos dias sem chuva" htmlFor="limiar">
                    <input
                      id="limiar"
                      type="number"
                      min="1"
                      max="366"
                      required
                      value={produto.limiarClimatico}
                      onChange={(e) => setProduto({ ...produto, limiarClimatico: e.target.value })}
                    />
                  </Campo>

                  <Campo rotulo="Limite por hectare (ETH)" htmlFor="valor-ha">
                    <input
                      id="valor-ha"
                      required
                      inputMode="decimal"
                      value={produto.valorPorHectareEth}
                      onChange={(e) =>
                        setProduto({ ...produto, valorPorHectareEth: e.target.value })
                      }
                    />
                  </Campo>

                  <Campo
                    rotulo="Taxa do premio (%)"
                    htmlFor="taxa"
                    ajuda="Valor informativo; o contrato não cobra o prêmio."
                  >
                    <input
                      id="taxa"
                      required
                      inputMode="decimal"
                      value={produto.taxaPremioPct}
                      onChange={(e) => setProduto({ ...produto, taxaPremioPct: e.target.value })}
                    />
                  </Campo>

                  <Campo rotulo="Vigencia (dias)" htmlFor="vigencia">
                    <input
                      id="vigencia"
                      type="number"
                      min="1"
                      max="730"
                      required
                      value={produto.vigenciaDias}
                      onChange={(e) => setProduto({ ...produto, vigenciaDias: e.target.value })}
                    />
                  </Campo>
                </div>

                <Aviso tipo="informacao" titulo="Em palavras, como o produtor vai ler:">
                  {condicaoEmPalavras(termosDoFormulario(produto))}
                </Aviso>

                <button type="submit" disabled={ocupado}>
                  Salvar produto
                </button>
              </form>
              <div className="cartao tabela-rolavel">
                <h2>Produtos disponiveis</h2>
                <table>
                  <thead>
                    <tr>
                      <th>Nome</th>
                      <th>Cultura</th>
                      <th>Condicao</th>
                      <th>Pagamento</th>
                      <th className="numero">Limite/ha</th>
                      <th className="numero">Taxa</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {produtos.map((p) => (
                      <tr key={p.id}>
                        <td>{p.nome}</td>
                        <td>{p.cultura}</td>
                        <td>
                          {p.limiarClimatico > 0 ? `${p.limiarClimatico} dias sem chuva` : null}
                        </td>
                        <td>Integral, parcela única</td>
                        <td className="numero">{p.valorPorHectareEth} ETH</td>
                        <td className="numero">{p.taxaPremioBps / 100}%</td>
                        <td>
                          <button className="perigo pequeno" onClick={() => retirarProduto(p.id)}>
                            Retirar
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
          {aba === "registros" && (
            <>
              <p>
                Consulte os cadastros abaixo. Para emitir um seguro solicitado pelo produtor, acesse{" "}
                <Link to="/seguradora/propostas">Propostas</Link>.
              </p>
              <div className="cartao tabela-rolavel">
                <h2>Produtores e propriedades</h2>
                <table>
                  <thead>
                    <tr>
                      <th>Produtor</th>
                      <th>Documento</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {produtores.map((p) => (
                      <tr key={p.id}>
                        <td>
                          <input
                            aria-label={`Nome de ${p.identificador}`}
                            defaultValue={p.nome}
                            onChange={editar("produtores", p.id, "nome")}
                          />
                          <div className="silencioso">{p.identificador}</div>
                        </td>
                        <td>
                          <input
                            aria-label={`Documento de ${p.identificador}`}
                            defaultValue={p.documento ?? ""}
                            onChange={editar("produtores", p.id, "documento")}
                          />
                        </td>
                        <td>
                          <button
                            className="secundario pequeno"
                            disabled={!edicoes[`produtores:${p.id}`]}
                            onClick={() => salvarEdicao("produtores", p.id)}
                          >
                            Salvar
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                <table>
                  <thead>
                    <tr>
                      <th>Propriedade</th>
                      <th>Municipio</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {propriedades.map((pp) => (
                      <tr key={pp.id}>
                        <td>
                          <input
                            aria-label={`Nome da propriedade ${pp.nome}`}
                            defaultValue={pp.nome}
                            onChange={editar("propriedades", pp.id, "nome")}
                          />
                          <div className="silencioso">
                            {pp.produtor_nome} · {pp.talhoes} talhao(oes)
                          </div>
                        </td>
                        <td>
                          <input
                            aria-label={`Municipio de ${pp.nome}`}
                            defaultValue={pp.municipio}
                            onChange={editar("propriedades", pp.id, "municipio")}
                          />
                        </td>
                        <td>
                          <button
                            className="secundario pequeno"
                            disabled={!edicoes[`propriedades:${pp.id}`]}
                            onClick={() => salvarEdicao("propriedades", pp.id)}
                          >
                            Salvar
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {talhoes === null ? (
                <Carregando />
              ) : (
                <div className="cartao tabela-rolavel">
                  <h2>Talhoes cadastrados</h2>
                  <table>
                    <thead>
                      <tr>
                        <th>Identificador</th>
                        <th>Produtor e propriedade</th>
                        <th>Cultura</th>
                        <th className="numero">Area</th>
                        <th />
                      </tr>
                    </thead>
                    <tbody>
                      {talhoes.map((t) => (
                        <tr key={t.id}>
                          <td>{t.identificador}</td>
                          <td>
                            {t.produtor.nome}
                            <div className="silencioso">
                              {t.propriedade.nome} — {t.propriedade.municipio}
                            </div>
                          </td>
                          <td>{t.cultura}</td>
                          <td className="numero">
                            {Number(t.areaHa).toLocaleString("pt-BR", { maximumFractionDigits: 4 })}{" "}
                            ha
                            <div className="silencioso">
                              {t.origemArea === "informada" ? "Informada" : "Medida por polígono"}
                            </div>
                          </td>
                          <td>
                            <div className="linha-de-botoes">
                              <button
                                className="secundario pequeno"
                                onClick={() =>
                                  setEditandoTalhao({
                                    id: t.id,
                                    identificador: t.identificador,
                                    cultura: t.cultura,
                                    areaHa: t.areaHa,
                                  })
                                }
                              >
                                Editar
                              </button>
                              <button
                                className="perigo pequeno"
                                onClick={() => removerTalhao(t.id)}
                              >
                                Remover
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>

                  {editandoTalhao ? (
                    <div className="cartao">
                      <h3>Editar {editandoTalhao.identificador}</h3>
                      <p className="silencioso">
                        So e possivel enquanto o talhao nao tem proposta nem apolice: depois, a area
                        cotada faz parte do que foi contratado.
                      </p>
                      <Campo rotulo="Cultura" htmlFor="cultura-edicao">
                        <select
                          id="cultura-edicao"
                          value={editandoTalhao.cultura}
                          onChange={(e) =>
                            setEditandoTalhao({ ...editandoTalhao, cultura: e.target.value })
                          }
                        >
                          <option value="soja">soja</option>
                          <option value="milho">milho</option>
                          <option value="cafe">cafe</option>
                          <option value="cana">cana</option>
                        </select>
                      </Campo>
                      <Campo
                        rotulo="Área (ha)"
                        htmlFor="area-edicao"
                        ajuda="Se alterar a área, ela passará a ser informada pela seguradora."
                      >
                        <input
                          id="area-edicao"
                          type="number"
                          min="0.0001"
                          step="0.0001"
                          value={editandoTalhao.areaHa}
                          onChange={(e) =>
                            setEditandoTalhao({ ...editandoTalhao, areaHa: e.target.value })
                          }
                        />
                      </Campo>
                      <div className="linha-de-botoes">
                        <button onClick={salvarTalhaoEditado}>Salvar talhao</button>
                        <button className="secundario" onClick={() => setEditandoTalhao(null)}>
                          Cancelar
                        </button>
                      </div>
                    </div>
                  ) : null}

                  <RodapeDaFronteira>
                    A área pode ser informada no cadastro. A referência climática é a estação INMET
                    A770, São Simão/SP.
                  </RodapeDaFronteira>
                </div>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}
