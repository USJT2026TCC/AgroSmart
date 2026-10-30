/**
 * Interfaces dos contratos, do ponto de vista do backend.
 *
 * Como no oraculo e no aplicativo, declaradas a mao: o backend depende do
 * contrato, e nao dos artefatos de compilacao de outro diretorio. Qualquer
 * alteracao em blockchain/contracts/ precisa ser espelhada aqui.
 */

const TUPLA_TERMOS =
  "(address produtor,address registry,bytes32 cultura,bytes32 talhao,uint32 limiarClimatico,uint64 vigenciaInicio,uint64 vigenciaFim,uint256 valorIndenizacao,bytes32 hashTermos)";

export const ABI_FACTORY = [
  "event ApoliceEmitida(address indexed apolice, address indexed produtor, bytes32 indexed talhao, uint256 valorIndenizacao, bytes32 hashTermos)",
];

export const ABI_APOLICE = [
  `function verTermos() view returns (${TUPLA_TERMOS})`,
  "function seguradora() view returns (address)",
  "function modoHistorico() view returns (bool)",
  "function situacao() view returns (uint8)",
  "function valorPago() view returns (uint256)",
  "function periodoAcionador() view returns (uint256)",
  "event GarantiaDepositada(address indexed seguradora, uint256 valor)",
  "event IndicesPublicados(uint256 indexed periodo, address indexed oraculo, uint32 indiceClimatico)",
  "event CondicaoAvaliada(uint256 indexed periodo, bool atendida)",
  "event PagamentoExecutado(address indexed produtor, uint256 indexed periodo, uint256 valor)",
  "event GarantiaResgatada(address indexed seguradora, uint256 valor)",
  "event ApoliceCancelada(address indexed solicitante, uint256 garantiaDevolvida)",
];
