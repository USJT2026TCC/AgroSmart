# Testes do AgroSmart

`npm test`, na raiz, executa a suíte completa. As configurações, fixtures e
contratos de ataque ficam nesta pasta; saídas locais ficam em `gerados/`, ignorado
pelo Git. Evidências selecionadas e o relatório ficam em `evidencias/`.

## O que é verificado e por quê

| Grupo            | Verificação                                                                       | Motivo                                                              |
| ---------------- | --------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| ETL              | Extração, validação, cache, limites e cópia auditável do dia anterior             | Evitar chuva inventada sem rastreio ou processamento inconsistente  |
| API e PostgreSQL | Perfis, carteira, talhões, cotação, termos e emissão                              | Impedir acesso indevido e registro de apólice divergente            |
| Regra histórica  | Contagem desde o início, chuva abaixo de 1 mm, reinício e gatilho                 | Confirmar quando o seguro deve ou não acionar                       |
| Contratos        | Autorização, depósito exato, pagamento único, cancelamento, resgate e reentrância | Conferir movimentação e proteção dos fundos                         |
| Oráculo          | Hash da série, termos, fila persistente, retomada e recibos                       | Recusar divergências e evitar publicação ou pagamento duplicados    |
| Interface        | Formulários, perfis, carteira e atualização das telas                             | Conferir o fluxo percebido pelo usuário                             |
| Infraestrutura   | Importação idempotente, persistência Docker e proxy HTTP                          | Confirmar instalação e integração dos serviços                      |
| Slither          | Análise estática dos três contratos operacionais                                  | Complementar os testes de execução com detecção de padrões de risco |

## Preparar e executar

Requisitos: Node.js compatível com o projeto, dependências instaladas com `npm ci`,
Docker em execução, Python e Slither disponível no PATH. Prepare o ambiente Python:

```powershell
python -m venv etl/.venv
./etl/.venv/Scripts/python.exe -m pip install -e "./etl[dev]"
python -m pip install slither-analyzer
npm test
```

O cache do pytest fica desativado pela configuração e pelo runner. As saídas de
cobertura e os temporários ficam em `gerados/`; uma execução separada confirmou os
26 testes do ETL com pytest 9.2.0. Essa verificação está registrada no relatório
de evidências de 03/11/2026.

No Linux, o executável Python do ambiente é `etl/.venv/bin/python`. O runner usa
esse caminho automaticamente. O usuário PostgreSQL precisa poder criar bancos;
a fixture inicia o servidor Docker e cria somente bancos descartáveis
`agrosmart_teste_<UUID>`. O ensaio Docker usa projeto e volume próprios.

Para executar um grupo:

```powershell
npm run cobertura --workspace api
npm run testar:integracao --workspace api
npm run cobertura --workspace oraculo
npm run cobertura --workspace interface
npm run testar:docker
```

A suíte completa também compila os contratos, mede sua cobertura, executa o
Slither, gera o build da interface e verifica o ETL. Não exige a chave privada
do produtor nem movimenta ETH da Sepolia.

## Como interpretar as evidências

As integrações automatizadas usam PostgreSQL real e EVM local isolada, com contas
públicas de teste. Nas telas, as fronteiras simuladas são identificadas nas
fixtures; o cadastro integrado também usa a API e PostgreSQL reais. Isso não
substitui o ensaio com extensão MetaMask e Sepolia.

O roteiro e o relatório distinguem resultados automatizados, observação de
apólices existentes e novas transações confirmadas. Prints devem ser acompanhados
do cenário e, quando houver transação, do endereço e hash verificáveis. Cobertura
não demonstra ausência de defeitos; Slither sem achados não é auditoria de segurança.
