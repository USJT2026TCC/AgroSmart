# Scripts de operação

| Arquivo | Responsabilidade |
|---|---|
| `iniciar.mjs` | Executa `npm start`, `npm stop` e `npm run status`; confere a Sepolia e configura API e oráculo no Docker; com `DOMINIO` em `blockchain/.env`, inclui o Caddy de `docker-compose.vm.yml` |
| `banco.mjs` | Configura e inicia o único PostgreSQL operacional do Docker Compose |
| `processos.mjs` | Executa comandos e localiza o Docker Desktop no Windows |
| `servir-interface.mjs` | Serve a interface compilada e encaminha `/api` ao backend na rede Docker |
| `preparar-dados.mjs` | Executa o ETL Python e o empacotador com `npm run dados:preparar` |
| `empacotar-dados.mjs` | Confere período e SHA-256 dos CSVs antes de copiar o pacote para a API |

O preparo de dados é opcional: o pacote INMET já acompanha o projeto. Após
reconstruí-lo, `npm start` atualiza a imagem Docker; a API importa os anos alterados.
A emissão é assinada pela seguradora na MetaMask; os índices são publicados pelo
oráculo. Ao iniciar os serviços, o oráculo pode processar apólices ativas e gerar
transações e pagamentos automaticamente na Sepolia.

## Executar o sistema (equipe)

Para subir o AgroSmart numa máquina, local ou na VM do link acima. Os passos ficam aqui
para a equipe; quem só usa o sistema não precisa deles.

### 1. Instale

- Node.js 22.12 ou mais recente
- Docker Desktop (com o Docker Compose)
- A extensão MetaMask no navegador, com a rede Sepolia e algum ETH de teste

### 2. Configure

Copie `blockchain/.env.example` para `blockchain/.env` e preencha:

| Variável | Para quê | Onde conseguir |
|---|---|---|
| `RPC_SEPOLIA` | Endereço de acesso à Sepolia | Crie uma conta gratuita na [Infura](https://www.infura.io) ou na [Alchemy](https://www.alchemy.com), crie um projeto, escolha a rede **Sepolia** e copie o endereço HTTPS (algo como `https://sepolia.infura.io/v3/...`) |
| `CHAVE_PRIVADA_ORACULO` | Conta que publica a contagem de dias secos | Com os contratos em uso, é a chave da conta `0xeFCf…D691D`, que a equipe entrega por canal privado; o `npm start` recusa outra chave. Com contratos próprios (passo 5), use uma conta nova da MetaMask: menu da conta → **Detalhes da conta** → **Mostrar chave privada** |
| `CHAVE_PRIVADA_SEGURADORA` | Só para publicar contratos próprios (passo 5) | Chave de outra conta da MetaMask, obtida do mesmo jeito; ela vira a seguradora dos contratos |
| `ETHERSCAN_API_KEY` | Só para verificar contratos próprios | Crie uma conta no [Etherscan](https://etherscan.io) e gere a chave em **API Keys** |
| `PRECO_GAS_GWEI` | Opcional: preço fixo do gás | Deixe em branco, ou use `0.01` para publicar contratos gastando pouco ETH de teste |

As contas do oráculo e da seguradora precisam de **ETH de teste da Sepolia** para pagar as
transações. Ele é gratuito e vem de uma *faucet*, como a do
[Google Cloud](https://cloud.google.com/application/web3/faucet/ethereum/sepolia) ou a da
[Alchemy](https://www.alchemy.com/faucets/ethereum-sepolia): cole o endereço da conta e peça.

Use somente contas criadas para testes, sem valor real. O arquivo `.env` guarda chaves
privadas e nunca vai para o Git; nunca envie essas chaves por e-mail ou chat aberto.

### 3. Inicie

```powershell
npm ci
npm start
```

O primeiro início baixa as imagens Docker e importa a série do INMET; leva alguns
minutos. Depois, abra **http://localhost:5173** e entre com:

| Perfil | Usuário | Senha |
|---|---|---|
| Seguradora | `seguradora` | `agrosmart` |
| Produtor | `produtor` | `agrosmart` |

O login é separado da MetaMask. Seguradora e produtor precisam de **contas MetaMask
diferentes**; a da seguradora é a que publicou os contratos. O botão **ⓘ** de cada
tela mostra o passo a passo do perfil.

### 4. Comandos do dia a dia

| Comando | O que faz |
|---|---|
| `npm run status` | Mostra se os serviços estão no ar |
| `npm stop` | Para tudo e preserva os dados |
| `docker compose down -v` | Apaga o banco para começar do zero |
| `docker compose logs --tail 50 oraculo` | Mostra o que o oráculo está fazendo |

### 5. Usar com suas próprias contas

Os contratos em uso pertencem às contas da equipe. Para rodar com outras contas,
publique contratos próprios (gasta um pouco de ETH de teste da conta da seguradora):

```powershell
$env:NOVA_IMPLANTACAO=1; npm run implantar:sepolia --workspace blockchain
npm start
```

O script publica o registro de oráculos, autoriza o oráculo, publica a fábrica de
apólices e grava os endereços em `blockchain/implantacoes/sepolia.json`.

### 6. Publicar numa VM (Google Cloud)

Roda o mesmo sistema numa máquina da nuvem, acessível por um endereço com HTTPS. Só o
navegador e a MetaMask ficam com quem usa; os logins são os mesmos do README principal.

1. Entre no [Google Cloud](https://console.cloud.google.com), ative a avaliação gratuita
   (crédito de US$ 300 por 90 dias) e crie um projeto. Abra **Compute Engine** e aceite
   ativar a API quando o console pedir.
2. Em **Compute Engine → Instâncias de VM → Criar instância**:
   - Região **southamerica-east1 (São Paulo)**, tipo de máquina **e2-medium**
     (4 GB de memória; menos que isso não compila a interface).
   - **Disco de inicialização → Alterar**: **Ubuntu 24.04 LTS**, 20 GB.
   - **Firewall**: marque **Permitir tráfego HTTP** e **Permitir tráfego HTTPS**.
3. Ainda na criação, em **Rede → Interface de rede → Endereço IPv4 externo**, escolha
   **Reservar endereço IP estático**, para o endereço não mudar quando a máquina for
   desligada. Anote o IP (exemplo: `34.1.2.3`) e clique em **Criar**.
4. Na lista de instâncias, clique em **SSH**: abre um terminal da VM no navegador.
   Instale Docker, Node.js e Git:

   ```bash
   curl -fsSL https://get.docker.com | sudo sh
   sudo usermod -aG docker $USER
   curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
   sudo apt-get install -y nodejs git
   exit
   ```

5. Abra o **SSH** de novo (para valer o acesso ao Docker), baixe o projeto e instale as dependências:

   ```bash
   git clone https://github.com/USJT2026TCC/AgroSmart.git
   cd AgroSmart && npm ci
   ```

6. Envie o `.env` para a VM, sem passar pelo Git: no terminal SSH, use **Fazer upload de
   arquivo** (ícone de engrenagem ou de seta, no topo da janela), escolha o
   `blockchain/.env` do seu computador e depois mova:

   ```bash
   mv ~/.env ~/AgroSmart/blockchain/.env
   ```

7. Informe o endereço público e inicie. O endereço é o IP com traços seguido de
   `.sslip.io`, um serviço gratuito que aponta para o próprio IP:

   ```bash
   echo "DOMINIO=34-1-2-3.sslip.io" >> blockchain/.env
   npm start
   ```

O sistema abre em `https://34-1-2-3.sslip.io`. Com `DOMINIO` preenchido, o `npm start` sobe
também o Caddy (`docker-compose.vm.yml`), que obtém o certificado HTTPS sozinho e é o único
serviço exposto; banco e API continuam fechados dentro da VM. Os serviços voltam sozinhos
quando a VM é ligada. Para economizar crédito, use **Parar** e **Iniciar** na lista de
instâncias, ou crie uma **Programação de instâncias** (Compute Engine → Programações) que
liga e desliga a VM em horários fixos; com o IP estático, o endereço continua o mesmo.
O banco da VM é independente do da sua máquina.
