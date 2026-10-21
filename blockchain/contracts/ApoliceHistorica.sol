// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {OracleRegistry} from "./OracleRegistry.sol";

/** @notice Apólice histórica de estiagem, com garantia e indenização integral.
 * O oráculo fornece o índice; o contrato valida acesso, datas e liquida uma vez.
 */
contract ApoliceHistorica {
    // ---------------------------------------------------------------------
    // Tipos
    // ---------------------------------------------------------------------

    /// @notice Regra de calculo do valor devido quando a condicao e atendida.
    enum ModoPagamento {
        INTEGRAL, //   0 - paga o limite contratado
        ESCALONADO // valor legado reservado; novas apolices recusam este modo
    }

    /// @notice Estado do ciclo de vida da apolice.
    enum Situacao {
        AGUARDANDO_GARANTIA, // 0 - implantada, ainda sem lastro depositado
        ATIVA, //               1 - garantida, apta a receber publicacoes
        LIQUIDADA, //           2 - indenizacao paga
        ENCERRADA, //           3 - vigencia vencida sem acionamento, garantia devolvida
        CANCELADA //            4 - cancelada antes do inicio da vigencia (RF10)
    }

    /**
     * @notice Termos imutaveis da apolice, fixados na implantacao.
     * @dev Agrupados em struct para nao estourar a pilha no construtor.
     */
    struct Termos {
        address produtor; // carteira que recebe a indenizacao
        address registry; // OracleRegistry consultado a cada publicacao
        bytes32 cultura; // identificador da cultura segurada
        bytes32 talhao; // identificador do talhao segurado
        ModoPagamento modoPagamento; // deve ser INTEGRAL; campo mantido por compatibilidade ABI
        uint32 limiarClimatico; // ex.: dias consecutivos sem chuva que acionam
        uint32 limiarClimaticoIntegral; // reservado; deve ser zero
        uint64 vigenciaInicio; // inicio da cobertura (unix timestamp)
        uint64 vigenciaFim; // fim da cobertura (unix timestamp)
        uint256 valorIndenizacao; // limite maximo indenizavel, em wei
        bytes32 hashTermos; // resumo criptografico dos termos completos (RF08)
    }

    /**
     * @notice Registro de uma publicacao de indice climatico para um periodo.
     * @dev Os campos estao ordenados para caber em um unico slot de 256 bits:
     *      oraculo(160) + indiceClimatico(32) + publicadoEm(32) = 224 bits.
     */
    struct Publicacao {
        address oraculo; // quem publicou
        uint32 indiceClimatico; // dias secos consecutivos calculados pelo oráculo
        uint32 publicadoEm; // marca de tempo do bloco, apenas para auditoria
    }

    // ---------------------------------------------------------------------
    // Constantes
    // ---------------------------------------------------------------------

    // Mesmo recorte de configuracao/historico.json: dias UTC inclusivos.
    uint64 public constant INICIO_DADOS = 1577836800;
    uint64 public constant FIM_DADOS = 1790812799;
    bool public constant modoHistorico = true;
    uint64 public instanteHistorico;
    error PeriodoHistoricoInvalido();


    /// @notice Base de pontos: 10000 bps = 100,00%.
    uint16 public constant BPS = 10_000;

    // ---------------------------------------------------------------------
    // Estado
    // ---------------------------------------------------------------------

    /// @notice Endereco que emitiu a apolice e deposita a garantia.
    address public immutable seguradora;

    /**
     * @notice Termos fixados na implantacao. Nenhuma funcao os altera.
     * @dev Declarado como `private` e exposto por `verTermos()`. O getter que o
     *      compilador geraria para uma struct publica de 11 campos devolve os campos
     *      um a um e estoura o limite de pilha da EVM ("stack too deep"); devolver a
     *      struct inteira de uma vez evita o problema e ainda gasta menos gas na
     *      leitura pelo back-end, que precisa de todos os campos juntos.
     */
    Termos internal termos;

    /// @notice Estado atual do ciclo de vida.
    Situacao public situacao;

    /// @notice Valor efetivamente pago ao produtor, em wei.
    uint256 public valorPago;

    /// @notice Periodo que acionou o pagamento. Valido apenas quando LIQUIDADA.
    uint256 public periodoAcionador;

    /// @dev Periodo de referencia => ja publicado (RF20).
    mapping(uint256 => bool) public periodoPublicado;

    /// @dev Periodo de referencia => registro completo da publicacao.
    mapping(uint256 => Publicacao) private _publicacoes;

    /// @notice Periodos publicados, na ordem em que chegaram.
    uint256[] public periodos;

    /// @dev Guarda de reentrancia (RNF09). 1 = livre, 2 = em execucao.
    uint256 private _trava = 1;

    // ---------------------------------------------------------------------
    // Eventos
    // ---------------------------------------------------------------------

    event ApoliceImplantada(
        address indexed seguradora,
        address indexed produtor,
        bytes32 indexed talhao,
        uint256 valorIndenizacao,
        bytes32 hashTermos
    );

    event GarantiaDepositada(address indexed seguradora, uint256 valor);

    event IndicesPublicados(
        uint256 indexed periodo,
        address indexed oraculo,
        uint32 indiceClimatico
    );

    event CondicaoAvaliada(uint256 indexed periodo, bool atendida, uint16 percentualBps);

    event PagamentoExecutado(address indexed produtor, uint256 indexed periodo, uint256 valor);

    event GarantiaResgatada(address indexed seguradora, uint256 valor);

    event ApoliceCancelada(address indexed solicitante, uint256 garantiaDevolvida);

    // ---------------------------------------------------------------------
    // Erros
    // ---------------------------------------------------------------------

    error EnderecoInvalido();
    error ParametroInvalido(string campo);
    error OrigemNaoAutorizada(address chamador);
    error PeriodoJaPublicado(uint256 periodo);
    error SituacaoInvalida(Situacao atual, Situacao esperada);
    error ForaDaVigencia(uint64 agora, uint64 inicio, uint64 fim);
    error GarantiaIncorreta(uint256 enviado, uint256 esperado);
    error VigenciaEmCurso(uint64 agora, uint64 fim);
    error FalhaNaTransferencia(address destino, uint256 valor);
    error ReentranciaDetectada();
    error SemSaldoParaResgatar();
    error DepositoDireto();
    error VigenciaIniciada(uint64 agora, uint64 inicio);

    // ---------------------------------------------------------------------
    // Modificadores
    // ---------------------------------------------------------------------

    /**
     * @dev Guarda de reentrancia. Nao usa booleano por economia de gas: alternar
     *      entre 1 e 2 evita o custo mais alto de escrever em um slot zerado.
     */
    modifier naoReentrante() {
        if (_trava != 1) revert ReentranciaDetectada();
        _trava = 2;
        _;
        _trava = 1;
    }

    modifier somenteSeguradora() {
        if (msg.sender != seguradora) revert OrigemNaoAutorizada(msg.sender);
        _;
    }

    /**
     * @dev Controle de acesso do RF18. A lista fica no OracleRegistry, de modo que
     *      revogar um oraculo comprometido nao exige tocar em cada apolice.
     */
    modifier somenteOraculoAutorizado() {
        if (!OracleRegistry(termos.registry).ehAutorizado(msg.sender)) {
            revert OrigemNaoAutorizada(msg.sender);
        }
        _;
    }

    modifier naSituacao(Situacao esperada) {
        if (situacao != esperada) revert SituacaoInvalida(situacao, esperada);
        _;
    }

    // ---------------------------------------------------------------------
    // Construcao
    // ---------------------------------------------------------------------

    /**
     * @param seguradora_ Endereco que emite a apolice e deposita a garantia.
     * @param t Termos completos da cobertura.
     *
     * A validacao e feita aqui porque, depois da implantacao, nada mais pode ser
     * corrigido: uma apolice com limiar invertido ficaria permanentemente quebrada.
     */
    constructor(address seguradora_, Termos memory t) {
        if (seguradora_ == address(0)) revert EnderecoInvalido();
        if (t.produtor == address(0)) revert EnderecoInvalido();
        if (t.registry == address(0)) revert EnderecoInvalido();
        if (t.produtor == seguradora_) revert ParametroInvalido("produtor igual a seguradora");
        if (t.valorIndenizacao == 0) revert ParametroInvalido("valorIndenizacao");
        if (t.vigenciaFim <= t.vigenciaInicio) revert ParametroInvalido("vigencia");
        if (t.hashTermos == bytes32(0)) revert ParametroInvalido("hashTermos");
        if (t.limiarClimatico == 0) revert ParametroInvalido("limiarClimatico");

        // Campos legados preservam o formato da ABI, sem habilitar pagamento parcial.
        if (t.modoPagamento != ModoPagamento.INTEGRAL) revert ParametroInvalido("modoPagamento");
        if (t.limiarClimaticoIntegral != 0) revert ParametroInvalido("limiarClimaticoIntegral");

        require(block.chainid == 11155111 || block.chainid == 31337, "Somente demonstracao");
        require(t.vigenciaInicio >= INICIO_DADOS && t.vigenciaInicio % 1 days == 0, "Inicio UTC invalido");
        require(t.vigenciaFim <= FIM_DADOS, "Fora da serie INMET");
        require(t.limiarClimatico >= 1 && t.limiarClimatico <= 366, "Gatilho experimental invalido");
        // Relogio apenas para impedir coberturas futuras no modo historico.
        // Nao gera aleatoriedade nem determina o indice; dados sao de anos anteriores.
        // slither-disable-next-line timestamp
        require(t.vigenciaFim % 1 days == 86399 && t.vigenciaFim < block.timestamp, "Fim historico invalido");
        instanteHistorico = t.vigenciaInicio - 1;

        seguradora = seguradora_;
        termos = t;
        situacao = Situacao.AGUARDANDO_GARANTIA;

        emit ApoliceImplantada(seguradora_, t.produtor, t.talhao, t.valorIndenizacao, t.hashTermos);
    }

    // ---------------------------------------------------------------------
    // Ciclo de vida
    // ---------------------------------------------------------------------

    /**
     * @notice A seguradora deposita o lastro da indenizacao e ativa a apolice.
     * @dev Sem esta etapa a apolice nao aceita publicacoes: nao faz sentido avaliar
     *      uma condicao cujo pagamento nao teria fundos, porque a transferencia
     *      falharia e reverteria a transacao inteira.
     */
    function depositarGarantia()
        external
        payable
        somenteSeguradora
        naSituacao(Situacao.AGUARDANDO_GARANTIA)
    {
        if (msg.value != termos.valorIndenizacao) {
            revert GarantiaIncorreta(msg.value, termos.valorIndenizacao);
        }

        situacao = Situacao.ATIVA;

        emit GarantiaDepositada(msg.sender, msg.value);
    }

    /**
     * @notice Devolve a seguradora o lastro que nao tem mais destino.
     *
     * @dev Ha duas portas de entrada, e cada uma cobre um caso diferente:
     *
     *  - situacao ATIVA: so depois do fim da vigencia. Ate la a condicao ainda pode
     *    ser acionada, e retirar a garantia deixaria a apolice sem como pagar.
     *
     *  - situacao LIQUIDADA: permite recuperar eventual saldo forcado por terceiros.
     *
     * A apolice liquidada continua LIQUIDADA depois do resgate: trocar para
     * ENCERRADA apagaria, da leitura do estado, o fato de ter havido pagamento.
     * Um segundo resgate e barrado pelo saldo zerado.
     */
    function resgatarGarantia() external naoReentrante somenteSeguradora {
        if (situacao == Situacao.ATIVA) {
            uint64 agora = _relogioDaCobertura();
            if (agora <= termos.vigenciaFim) revert VigenciaEmCurso(agora, termos.vigenciaFim);
        } else if (situacao != Situacao.LIQUIDADA) {
            revert SituacaoInvalida(situacao, Situacao.ATIVA);
        }

        uint256 saldo = address(this).balance;

        // O Slither alerta que o saldo de um contrato pode ser inflado a forca
        // (por selfdestruct de outro contrato), o que quebraria comparacoes de
        // igualdade estrita. Aqui a comparacao so decide se ha algo a devolver:
        // saldo inflado apenas faz a seguradora receber tambem o valor forcado,
        // que de outro modo ficaria preso. Nao ha caminho em que isso prejudique
        // o produtor ou a seguradora (Slither: incorrect-equality).
        // slither-disable-next-line incorrect-equality
        if (saldo == 0) revert SemSaldoParaResgatar();

        // Efeitos antes da interacao (RNF09). A apolice liquidada nao muda de
        // situacao; nela, a protecao contra repeticao e o proprio saldo, que ja
        // esta zerado quando a chamada reentrante chegaria.
        if (situacao == Situacao.ATIVA) situacao = Situacao.ENCERRADA;

        // Evento antes da transferencia, pela mesma razao de publicarIndices: se
        // a transferencia falhar, a reversao leva o evento junto.
        emit GarantiaResgatada(seguradora, saldo);

        // slither-disable-next-line low-level-calls
        (bool ok, ) = seguradora.call{value: saldo}("");
        if (!ok) revert FalhaNaTransferencia(seguradora, saldo);
    }

    /**
     * @notice Cancela a apolice antes do inicio da vigencia (RF10).
     *
     * @dev Podem cancelar o produtor titular e a seguradora: os dois lados do
     *      contrato. Depois do inicio da vigencia, nao. A condicao ja pode estar
     *      em curso, e cancelar seria uma forma de fugir de um pagamento devido.
     *
     *      A garantia, se ja depositada, volta a seguradora, que a depositou. O
     *      premio e cobrado fora da cadeia, e sua devolucao segue a regra
     *      comercial, que o contrato nao conhece.
     */
    function cancelar() external naoReentrante {
        if (msg.sender != seguradora && msg.sender != termos.produtor) {
            revert OrigemNaoAutorizada(msg.sender);
        }
        if (situacao != Situacao.AGUARDANDO_GARANTIA && situacao != Situacao.ATIVA) {
            revert SituacaoInvalida(situacao, Situacao.ATIVA);
        }

        uint64 agora = _relogioDaCobertura();
        if (agora >= termos.vigenciaInicio) revert VigenciaIniciada(agora, termos.vigenciaInicio);

        uint256 saldo = address(this).balance;

        // Efeitos antes da interacao (RNF09): uma reentrada encontraria a apolice
        // ja CANCELADA e pararia na verificacao de situacao acima.
        situacao = Situacao.CANCELADA;

        emit ApoliceCancelada(msg.sender, saldo);

        // Mesma situacao de resgatarGarantia: a igualdade so decide se ha algo a
        // devolver, e um saldo inflado a forca apenas seria devolvido junto
        // (Slither: incorrect-equality).
        // slither-disable-next-line incorrect-equality
        if (saldo == 0) return;

        // slither-disable-next-line low-level-calls
        (bool ok, ) = seguradora.call{value: saldo}("");
        if (!ok) revert FalhaNaTransferencia(seguradora, saldo);
    }

    // ---------------------------------------------------------------------
    // Travessia: publicacao, avaliacao e liquidacao
    // ---------------------------------------------------------------------

    /**
     * @notice Ponto unico de entrada de dados externos na cadeia.
     *
     * Publica o indice climatico do periodo, avalia a condicao contratada e, se
     * atendida, transfere a indenizacao — tudo na mesma transacao (RF23, RF24).
     *
     * @param periodo Identificador do periodo de referencia (ex.: 20261015 = 15/10/2026).
     * @param indiceClimatico Dias secos consecutivos calculados pelo oráculo.
     *
     * @dev A ordem das operacoes e deliberada e segue verificar, atualizar estado e
     *      so entao interagir. O RNF09 exige as duas protecoes, entao a guarda
     *      `naoReentrante` aparece como primeiro modificador: assim ela e a checagem
     *      mais externa e uma reentrada e barrada antes de qualquer outra validacao.
     */
    function publicarIndices(
        uint256 periodo,
        uint32 indiceClimatico
    ) external naoReentrante somenteOraculoAutorizado naSituacao(Situacao.ATIVA) {
        // ---------- Verificacoes ----------
        if (periodoPublicado[periodo]) revert PeriodoJaPublicado(periodo);
        _exigirVigencia(periodo, indiceClimatico);

        // ---------- Efeitos ----------
        periodoPublicado[periodo] = true;
        periodos.push(periodo);
        _publicacoes[periodo] = Publicacao({
            oraculo: msg.sender,
            indiceClimatico: indiceClimatico,
            publicadoEm: uint32(block.timestamp)
        });

        emit IndicesPublicados(periodo, msg.sender, indiceClimatico);

        _liquidarSeAtendida(periodo, indiceClimatico);
    }

    /// @dev Publicacoes so valem dentro da vigencia.
    function _relogioDaCobertura() private view returns (uint64) {
        return instanteHistorico;
    }

    function _exigirVigencia(uint256 periodo, uint32 indice) private {
        uint256 ano = periodo / 10000;
        uint256 mes = (periodo / 100) % 100;
        uint256 dia = periodo % 100;
        if (ano < 2000 || ano > 2099 || mes < 1 || mes > 12 || dia < 1) revert PeriodoHistoricoInvalido();
        uint256[12] memory meses = [uint256(31),28,31,30,31,30,31,31,30,31,30,31];
        if (ano % 4 == 0) meses[1] = 29; // 2000–2099: regra gregoriana equivalente
        if (dia > meses[mes-1]) revert PeriodoHistoricoInvalido();
        uint256 dias = 10957; // 01/01/2000 desde Unix epoch
        for (uint256 a=2000; a<ano; a++) dias += a % 4 == 0 ? 366 : 365;
        for (uint256 m=1; m<mes; m++) dias += meses[m-1];
        uint64 instante = uint64((dias + dia - 1) * 1 days);
        if (instante < termos.vigenciaInicio || instante > termos.vigenciaFim || instante <= instanteHistorico) revert PeriodoHistoricoInvalido();
        if (indice > (instante-termos.vigenciaInicio)/1 days + 1) revert PeriodoHistoricoInvalido();
        // No ultimo dia, libera posterior resgate se nao houver indenizacao.
        instanteHistorico = instante + 86399 == termos.vigenciaFim ? termos.vigenciaFim + 1 : instante;
    }

    /**
     * @dev Avalia a condicao e, se atendida, liquida. Chamada so pela publicacao,
     *      com os efeitos ja gravados, mantendo a ordem verificar-efeitos-interacao.
     */
    // O destino vem dos termos fixados no construtor; nenhuma funcao permite
    // altera-lo e o oraculo so informa periodo e indice. A transferencia a esse
    // beneficiario e a finalidade do contrato. Testes conferem valor, destino,
    // atomicidade e impossibilidade de repetir o pagamento.
    // slither-disable-next-line arbitrary-send-eth
    function _liquidarSeAtendida(uint256 periodo, uint32 indiceClimatico) private {
        uint16 percentualBps = _percentualDevido(indiceClimatico);
        bool atendida = percentualBps > 0;

        emit CondicaoAvaliada(periodo, atendida, percentualBps);

        if (!atendida) return;

        uint256 valor = (termos.valorIndenizacao * percentualBps) / BPS;

        // Situacao muda ANTES da transferencia. Esta linha e a protecao efetiva
        // contra reentrancia: uma reentrada cairia no modificador naSituacao e
        // seria revertida, porque a apolice ja nao esta ATIVA.
        situacao = Situacao.LIQUIDADA;
        valorPago = valor;
        periodoAcionador = periodo;

        // O evento sai ANTES da transferencia. Pode parecer que anuncia um
        // pagamento que ainda nao aconteceu, mas a atomicidade garante o
        // contrario: se a transferencia falhar, a transacao inteira reverte e o
        // evento some junto. Emitir antes fecha a ordem verificar-efeitos-
        // interacao por completo, porque evento tambem e efeito (Slither:
        // reentrancy-events).
        emit PagamentoExecutado(termos.produtor, periodo, valor);

        // ---------- Interacao ----------
        // `call` e nao `transfer`: `transfer` repassa so 2300 de gas, e falha com
        // produtor que use carteira de contrato, como uma multisig. A protecao
        // contra reentrancia nao depende do limite de gas, e sim da ordem acima
        // e da guarda `naoReentrante` (Slither: low-level-calls).
        // slither-disable-next-line low-level-calls
        (bool ok, ) = termos.produtor.call{value: valor}("");
        if (!ok) revert FalhaNaTransferencia(termos.produtor, valor);
    }

    /**
     * @notice Calcula o percentual devido para um indice climatico.
     * @return Percentual em bps. Zero significa condicao nao atendida.
     *
     * @dev Funcao pura e publica de proposito: a aplicacao do produtor a usa para
     *      mostrar, antes do aceite, exatamente o que aciona e o que nao aciona o
     *      pagamento (RNF04), com a garantia de ser a mesma regra da liquidacao.
     */
    function simularPercentual(uint32 indiceClimatico) external view returns (uint16) {
        return _percentualDevido(indiceClimatico);
    }

    /** @dev Gatilho experimental: abaixo dele nada e devido; nele ou acima, 100%. */
    function _percentualDevido(uint32 indiceClimatico) private view returns (uint16) {
        return indiceClimatico < termos.limiarClimatico ? 0 : BPS;
    }

    // ---------------------------------------------------------------------
    // Consultas
    // ---------------------------------------------------------------------

    /**
     * @notice Devolve os termos contratados.
     * @dev Consulta publica exigida pelo RF08: qualquer interessado pode ler o
     *      `hashTermos` gravado e compara-lo com o resumo do documento que assinou.
     */
    function verTermos() external view returns (Termos memory) {
        return termos;
    }

    /// @notice Devolve o registro completo de uma publicacao (RNF18).
    function publicacao(uint256 periodo) external view returns (Publicacao memory) {
        return _publicacoes[periodo];
    }

    /// @notice Quantidade de periodos ja publicados.
    function totalPeriodos() external view returns (uint256) {
        return periodos.length;
    }

    /// @notice Saldo de garantia ainda retido pelo contrato, em wei.
    function garantiaRetida() external view returns (uint256) {
        return address(this).balance;
    }

    /**
     * @dev Rejeita transferencias avulsas. O unico caminho de entrada de valor e
     *      depositarGarantia(), de modo que o saldo do contrato sempre corresponde
     *      a um lastro identificado.
     */
    receive() external payable {
        revert DepositoDireto();
    }
}
