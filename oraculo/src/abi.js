"use strict";

/**
 * Interface minima da apolice, do ponto de vista do oraculo.
 *
 * Contem apenas o que o servico precisa chamar, e nao a ABI completa gerada pelo
 * Hardhat. A escolha e deliberada: o oraculo passa a depender do contrato da
 * apolice, e nao dos artefatos de compilacao de outro diretorio. Se uma
 * assinatura mudar, a falha aparece aqui, de forma explicita, em vez de surgir
 * como um erro obscuro de decodificacao em tempo de execucao.
 *
 * Qualquer alteracao nas funcoes abaixo precisa ser espelhada em
 * blockchain/contracts/ApoliceHistorica.sol.
 */
const ABI_APOLICE = [
  // --- escrita -------------------------------------------------------------
  "function publicarIndices(uint256 periodo, uint32 indiceClimatico)",

  // --- leitura -------------------------------------------------------------
  "function modoHistorico() view returns (bool)",
  "function verTermos() view returns ((address produtor,address registry,bytes32 cultura,bytes32 talhao,uint32 limiarClimatico,uint64 vigenciaInicio,uint64 vigenciaFim,uint256 valorIndenizacao,bytes32 hashTermos))",
  "function periodoPublicado(uint256 periodo) view returns (bool)",

  // --- erros customizados --------------------------------------------------
  // Declarados para que o ethers traduza a revert em mensagem legivel no log,
  // em vez de devolver apenas os quatro bytes do seletor.
  "error OrigemNaoAutorizada(address chamador)",
  "error PeriodoJaPublicado(uint256 periodo)",
  "error SituacaoInvalida(uint8 atual, uint8 esperada)",
  "error ParametroInvalido(string campo)",
  "error FalhaNaTransferencia(address destino, uint256 valor)",
  "error ReentranciaDetectada()",
  "error PeriodoHistoricoInvalido()",
];

const ABI_REGISTRY = ["function ehAutorizado(address oraculo) view returns (bool)"];

module.exports = { ABI_APOLICE, ABI_REGISTRY };
