# Aplicativo

Abra http://localhost:5173 após `npm start`. O caminho operacional é Sepolia, com MetaMask no navegador. Não há ativação de carteira falsa por URL.

| Perfil | O que faz |
|---|---|
| Produtor | Vincula carteira por assinatura, consulta cotação, envia proposta e acompanha a apólice |
| Seguradora | Confere proposta, assina emissão e depósito da garantia e acompanha a carteira de apólices |

Login é autenticação da API; não troca a conta selecionada na MetaMask. A extensão controla a conta que assina e exige confirmação do usuário. A interface deve ser conferida na revisão de frontend quanto à clareza desses papéis.

O detalhe da apólice lê estado e eventos da blockchain. A API acrescenta cadastro, proposta e procedência. Valor pago e recibo devem ser conferidos na mesma rede da carteira.

O histórico climático exibido na cotação é uma comparação hipotética com anos passados. Não cria dívida nem indenizações antigas a receber. As telas ainda serão simplificadas conforme PONTOS A CORRIGIR.docx, na etapa de frontend; isso não foi confundido com a movimentação de testes.

Os testes de tela ficam em testes/app. As carteiras e APIs falsas existem apenas no ambiente desses testes.


## Reproducao historica

Em **Simular e contratar**, marque **Usar dados historicos de Sao Simao (A770)**.
Informe inicio e fim da cobertura e gatilho experimental em dias (por exemplo 10,
15 ou 30). **Analisar periodo no banco** mostra o primeiro acionamento e as lacunas,
sem enviar transacao. A proposta bloqueia intervalos com dias insuficientes.

Depois de enviar a proposta, a seguradora assina emissao e garantia na MetaMask.
O oraculo percorre a serie do banco desde o inicio da cobertura e publica o primeiro
acionamento ou o ultimo dia sem acionamento. O detalhe identifica o modo historico,
o periodo meteorologico e o pagamento atual. Cancelamento usa o inicio da reproducao,
nao a data real do computador. A carteira recebe ETH de teste, nao pagamento de 2024.

O exemplo 07/02/2024–07/02/2025 foi conferido: todos os 367 dias inclusivos atendem
ao criterio de pelo menos 20 horas validas. Isso nao implica ausencia de falhas horarias.
