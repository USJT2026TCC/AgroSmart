// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title ProdutorQueRecusa
 * @notice Beneficiario que rejeita qualquer transferencia. Usado apenas em teste.
 *
 * Serve para comprovar que a recusa so desfaz o proprio saque: a publicacao, a
 * liquidacao e o relogio da cobertura nao dependem da carteira do beneficiario.
 */
contract ProdutorQueRecusa {
    error PagamentoRecusado();

    /// @notice Tenta sacar a indenizacao, que este contrato recusara ao receber.
    function sacar(address apolice) external {
        (bool ok, bytes memory erro) = apolice.call(abi.encodeWithSignature("sacarIndenizacao()"));
        if (!ok) {
            assembly {
                revert(add(erro, 32), mload(erro))
            }
        }
    }

    receive() external payable {
        revert PagamentoRecusado();
    }
}
