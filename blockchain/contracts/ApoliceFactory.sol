// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ApoliceHistorica} from "./ApoliceHistorica.sol";
import {OracleRegistry} from "./OracleRegistry.sol";

/**
 * @title ApoliceFactory
 * @notice Implanta as apolices.
 *
 * Atende ao RF07 (implantar na rede, na contratacao, o contrato da apolice
 * parametrizado). O evento ApoliceEmitida, emitido so por esta fabrica, e o
 * registro auditavel de cada apolice: a API identifica as apolices por ele.
 *
 * A fabrica nao custodia valor: a garantia e depositada pela seguradora diretamente
 * na apolice, para que o endereco pagador continue sendo o da seguradora.
 */
contract ApoliceFactory {
    /// @notice Registro de oraculos que toda apolice desta fabrica consulta.
    OracleRegistry public immutable registry;

    /// @notice Seguradora que opera a fabrica.
    address public immutable seguradora;

    event ApoliceEmitida(
        address indexed apolice,
        address indexed produtor,
        bytes32 indexed talhao,
        uint256 valorIndenizacao,
        bytes32 hashTermos
    );

    error NaoEhSeguradora(address chamador);
    error EnderecoInvalido();

    modifier somenteSeguradora() {
        if (msg.sender != seguradora) revert NaoEhSeguradora(msg.sender);
        _;
    }

    constructor(address registry_, address seguradora_) {
        if (registry_ == address(0) || seguradora_ == address(0)) revert EnderecoInvalido();
        // A mesma seguradora administra o registro, emite e garante as apolices.
        if (OracleRegistry(registry_).seguradora() != seguradora_) revert EnderecoInvalido();

        registry = OracleRegistry(registry_);
        seguradora = seguradora_;
    }

    /// @notice Emissao explicitamente historica. Nunca representa contratacao passada real.
    function emitirApoliceHistorica(
        ApoliceHistorica.Termos memory termos
    ) external somenteSeguradora returns (address apolice) {
        termos.registry = address(registry);
        apolice = address(new ApoliceHistorica(seguradora, termos));

        emit ApoliceEmitida(
            apolice,
            termos.produtor,
            termos.talhao,
            termos.valorIndenizacao,
            termos.hashTermos
        );
    }
}
