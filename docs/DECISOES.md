# Decisoes do sistema atual

- Demonstracao academica sem validacao agronomica ou atuarial comercial.
- Fonte unica INMET A770 (Sao Simao/SP), 01/01/2020 a 30/09/2026, UTC.
- Talhao ficticio considerado coincidente com a estacao.
- Contagem de estiagem inicia na cobertura; chuva inferior a 1 mm e minimo de 20 horas validas.
- Lacunas nao sao preenchidas como zero. Cobertura incompleta e recusada.
- Gatilho experimental de 1 a 366 dias, fixado na proposta e na emissao.
- Pagamento integral unico, garantia previa e premio informativo.
- PostgreSQL/PostGIS exclusivo, inicializado pelo esquema atual.
- API fornece dados autenticados; oraculo confere serie/termos e publica; contrato liquida.
- Timestamps atuais servem a operacao e transacoes, nunca como medicao climatica.
- Uso na Sepolia com MetaMask. Infraestrutura local de blockchain somente em testes.
- Fábrica histórica implantada e verificada na Sepolia em 21/10/2026.
- Sepolia pública, funções permissionadas; não operar uma rede privada neste escopo.
- Banco, API, oráculo e interface no Docker; nenhum nó blockchain local no uso.
