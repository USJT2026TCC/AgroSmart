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
