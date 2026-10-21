// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;
import {ApolicePolicy} from "./ApolicePolicy.sol";

/** @notice DEMONSTRACAO historica, exclusiva Sepolia e suites locais.
 * A data do bloco permanece real. Somente o relogio da cobertura e historico.
 * O oraculo continua sendo responsavel pela verdade do indice; o contrato
 * valida intervalo, ordem dos periodos e limite de dias desde o inicio.
 */
contract ApoliceHistorica is ApolicePolicy {
    // Mesmo recorte de configuracao/historico.json: dias UTC inclusivos.
    uint64 public constant INICIO_DADOS = 1577836800;
    uint64 public constant FIM_DADOS = 1790812799;
    bool public constant modoHistorico = true;
    uint64 public instanteHistorico;
    error PeriodoHistoricoInvalido();

    constructor(address seguradora_, Termos memory t) ApolicePolicy(seguradora_, t) {
        require(block.chainid == 11155111 || block.chainid == 31337, "Somente demonstracao");
        require(t.vigenciaInicio >= INICIO_DADOS && t.vigenciaInicio % 1 days == 0, "Inicio UTC invalido");
        require(t.vigenciaFim <= FIM_DADOS, "Fora da serie INMET");
        require(t.limiarClimatico >= 1 && t.limiarClimatico <= 366, "Gatilho experimental invalido");
        // Relogio apenas para impedir coberturas futuras no modo historico.
        // Nao gera aleatoriedade nem determina o indice; dados sao de anos anteriores.
        // slither-disable-next-line timestamp
        require(t.vigenciaFim % 1 days == 86399 && t.vigenciaFim < block.timestamp, "Fim historico invalido");
        instanteHistorico = t.vigenciaInicio - 1;
    }

    function _relogioDaCobertura() internal view override returns (uint64) {
        return instanteHistorico;
    }

    function _exigirVigencia(uint256 periodo, uint32 indice) internal override {
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
}
