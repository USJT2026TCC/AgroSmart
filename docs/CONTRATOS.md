# Contratos

## Função de cada contrato

| Contrato | Responsabilidade |
|---|---|
| OracleRegistry | A seguradora autoriza ou revoga endereços de oráculos |
| ApoliceFactory | Somente a seguradora pode emitir apólices; fixa o registro usado |
| ApolicePolicy | Guarda termos, recebe garantia, verifica publicações e transfere a indenização |

## Fluxo atual

1. A seguradora emite a apólice com produtor, vigência, limiar experimental e limite em ETH de teste.
2. A seguradora deposita exatamente esse limite. Só então a apólice fica ativa.
3. Durante a vigência, apenas oráculo autorizado pode publicar período e índice climático. O mesmo período não pode ser publicado novamente.
4. Índice abaixo do limiar: pagamento zero. No limiar ou acima: 100% do limite, uma única vez. O produtor recebe automaticamente.
5. Antes da vigência, produtor ou seguradora podem cancelar; a garantia volta à seguradora. Depois do fim, a seguradora pode resgatar a garantia não utilizada.

Estado e valor pago são atualizados antes da transferência. Se a transferência falha, toda a transação reverte. A guarda contra reentrância permanece ativa. Apólice liquidada não aceita nova publicação.

## Limites do que o contrato faz

O contrato não lê sensores, não interpreta fotos, não calcula perda agrícola e não valida fisicamente a medição. Recebe o índice calculado pelo oráculo. O índice implementado é a sequência de dias secos; excesso de chuva não está coberto. O prêmio exibido na cotação não é cobrado pelo contrato.

O hash dos termos existe. Não há hash do conjunto de leituras na publicação atual; não confundir as duas coisas. Os campos reservados modoPagamento e limiarClimaticoIntegral só aceitam zero: não habilitam indenização escalonada.

## Implantação e verificações

A implantação atual está em `contratos/implantacoes/sepolia.json`, protocolo clima-integral-v1. Registro e fábrica foram implantados em 19/10/2026 e verificados no Etherscan. Registros de implantações anteriores ficam apenas em testes/evidencias/legado.

Fontes de produção: contratos/contracts. Todos os testes, contratos de ataque, configurações de cobertura e ensaios estão em testes/contratos e testes/configuracao. Execute `npm test` na raiz. A configuração de testes possui artefatos próprios e não altera os metadados de compilação da implantação de produção.
