// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title OracleRegistry
 * @notice Lista de enderecos autorizados a publicar indices nas apolices.
 *
 * Atende ao RF18 (manter no contrato a lista de enderecos autorizados e rejeitar
 * publicacao de qualquer outro endereco) e ao RNF10 (controle de acesso por funcao).
 *
 * A lista vive em um contrato separado, e nao dentro de cada apolice, por dois motivos:
 * 1. Revogar um oraculo comprometido passa a ser uma unica transacao, e nao uma por apolice;
 * 2. O custo de implantacao de cada apolice cai, porque ela guarda apenas a referencia.
 *
 * Cada publicacao consulta o registro para conferir a autorizacao vigente.
 */
contract OracleRegistry {
    /// @notice Seguradora que administra a lista, a mesma da fabrica e das apolices.
    address public immutable seguradora;

    /// @dev Endereco => autorizado a publicar.
    mapping(address => bool) private _autorizados;

    event OraculoAutorizado(address indexed oraculo, address indexed porQuem);
    event OraculoRevogado(address indexed oraculo, address indexed porQuem);

    error NaoEhSeguradora(address chamador);
    error EnderecoInvalido();
    error JaAutorizado(address oraculo);
    error NaoAutorizado(address oraculo);

    modifier somenteSeguradora() {
        if (msg.sender != seguradora) revert NaoEhSeguradora(msg.sender);
        _;
    }

    /**
     * @param seguradora_ Endereco que administrara a lista.
     */
    constructor(address seguradora_) {
        if (seguradora_ == address(0)) revert EnderecoInvalido();
        seguradora = seguradora_;
    }

    /**
     * @notice Autoriza um endereco a publicar indices.
     * @dev Restrito a seguradora (HU02, criterio de aceite 3).
     */
    function autorizar(address oraculo) external somenteSeguradora {
        if (oraculo == address(0)) revert EnderecoInvalido();
        if (_autorizados[oraculo]) revert JaAutorizado(oraculo);

        _autorizados[oraculo] = true;

        emit OraculoAutorizado(oraculo, msg.sender);
    }

    /**
     * @notice Revoga a autorizacao de um endereco.
     * @dev Restrito a seguradora (HU02, criterio de aceite 3).
     */
    function revogar(address oraculo) external somenteSeguradora {
        if (!_autorizados[oraculo]) revert NaoAutorizado(oraculo);

        _autorizados[oraculo] = false;

        emit OraculoRevogado(oraculo, msg.sender);
    }

    /**
     * @notice Informa se o endereco pode publicar indices.
     * @dev Funcao consultada por cada apolice a cada publicacao.
     */
    function ehAutorizado(address oraculo) external view returns (bool) {
        return _autorizados[oraculo];
    }
}
