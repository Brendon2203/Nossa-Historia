# Nossa História

## O que este projeto faz

Este projeto é um mapa interativo de memórias para registrar momentos especiais de um relacionamento.

Ele permite:
- visualizar marcadores no mapa;
- abrir fotos, descrições e músicas relacionadas a cada memória;
- adicionar, editar e excluir pins;
- importar/exportar um backup em JSON;
- fazer upload de imagens para o projeto.

A interface é construída com HTML, CSS e JavaScript, usando Leaflet para o mapa e um backend simples em Node.js + Express para salvar os dados.

## Estrutura principal

- `index.html` — página principal e interface visual.
- `style.css` — estilos e tema do projeto.
- `script.js` — lógica do mapa, busca, modal, CRUD e upload.
- `server.js` — backend Express com API para memórias e upload.
- `data/memories.json` — armazenamento das memórias.
- `uploads/` — imagens enviadas pelo usuário.

## Requisitos

- Node.js instalado
- npm instalado

## Hospedagem recomendada: Render

Este projeto usa **Node.js + Express** e salva fotos/pins em **arquivos no disco**.
O **Render** é a melhor opção — o código sobe sem refatoração.

### ⚠️ IMPORTANTE: Escolha do Plano

| | Plano Gratuito | Plano Starter (~US$7/mês) |
|---|---|---|
| **Custo** | $0 | ~$7/mês |
| **Servidor online** | Sim | Sim |
| **Disco persistente** | ❌ NÃO | ✅ **SIM** |
| **Pins salvos** | ❌ Perdem ao redeployar | ✅ Permanecem |
| **Imagens salvas** | ❌ Desaparecem | ✅ Permanecem |
| **Restart automático** | Sim (~15 min inatividade) | Sim (~15 min inatividade) |

**⭐ Recomendação:** Use o **Plano Starter com disco persistente** para não perder dados.

O arquivo `render.yaml` **já está configurado com disco ativado** — basta escolher o plano Starter ao fazer o deploy.

### Deploy no Render (passo a passo)

1. Envie o projeto para o GitHub.
2. Acesse [render.com](https://render.com) e crie uma conta.
3. Clique em **New → Blueprint** e conecte o repositório.
4. O Render detecta o arquivo `render.yaml` e configura tudo automaticamente.
5. **⚠️ Escolha o plano:**
   - Se quer manter fotos e pins: escolha **Starter** (disco persistente)
   - Se quer gratuito: saiba que perderá tudo ao redeployar
6. Clique em **Apply** e aguarde o deploy.

### O que mudou?

✅ **Novo `render.yaml`:**
- Disco persistente **já está ativado** (`2GB`)
- Plano configurado para **Starter** (com disco)
- `DATA_DIR` e `UPLOADS_DIR` apontam para `/var/data` (disco persistente)

✅ **Novo aviso ao exportar backup:**
- Quando você clica em "Exportar backup", recebe um aviso se tem imagens locais
- O JSON salva apenas os *links* das imagens, não as imagens em si
- Para preservar tudo: mantenha disco persistente ativo no Render

### Rodar localmente

1. Abra o terminal na pasta do projeto.
2. Instale as dependências:

   ```bash
   npm install
   ```

3. Inicie o servidor:

   ```bash
   npm start
   ```

4. Abra no navegador:

   ```text
   http://localhost:3000
   ```

## Endpoints da API

- `GET /api/memories` — lista as memórias
- `POST /api/memories` — cria uma nova memória
- `PUT /api/memories/:id` — atualiza uma memória
- `DELETE /api/memories/:id` — remove uma memória
- `POST /api/upload` — faz upload de imagem
- `POST /api/memories/import` — importa lista de memórias (JSON)
- `POST /api/restore-backup-zip` — restaura backup completo em ZIP com imagens
- `GET /api/backup/info` — informações sobre backup e imagens (debug)
- `GET /api/backup/download` — download de backup completo em ZIP (com fotos)
- `GET /api/health` — verifica se o servidor está online

## 📦 Sistema de Backup

### Opção 1: Exportar backup JSON
- Clique em **Modo Edição** → **Exportar backup**
- Baixa arquivo `.json` com todas as memórias
- ⚠️ Imagens **NÃO são incluídas**, apenas links

### Opção 2: Exportar Completo com Fotos (NOVO!)
- Clique em **Modo Edição** → **Exportar completo c/ fotos**
- Baixa arquivo `.zip` com:
  - `memories.json` (lista de memórias)
  - `uploads/` (pasta com TODAS as imagens)
  - `README.txt` (instruções de restauração)
- ✅ **Tudo incluído!**

### Como restaurar um backup

#### Restaurar JSON (dados apenas)
1. Vá em **Modo Edição**
2. Clique em **Importar backup**
3. Selecione arquivo `.json`
4. Confirme — imagens usarão links anteriores

#### Restaurar ZIP (dados + fotos) — NOVO!
1. Vá em **Modo Edição**
2. Clique em **Importar backup**
3. Selecione arquivo `.zip`
4. Confirme — **tudo é restaurado automaticamente** ✅
   - Todas as memórias retornam
   - Todas as fotos são copiadas para o servidor
   - Links das imagens atualizam automaticamente

**💡 DICA:** Use o ZIP para restauração completa, JSON apenas para backup rápido.

## ☁️ Backup automático do Google Drive

Na inicialização, o servidor **baixa automaticamente** o backup mais recente da pasta do Drive e restaura memórias + fotos.

**Pasta padrão:** [Google Drive - Nossa História](https://drive.google.com/drive/folders/1g0LxsS7Shd3-xWLE-F6kzEHj4FpO2iAX)

### Como manter o site sempre atualizado

1. No site, vá em **Modo Edição** → **Exportar completo c/ fotos**
2. Faça upload do arquivo `.zip` na pasta do Drive acima
3. Se houver mais de um ZIP, o servidor usa o **mais recente** (com API key) ou o **primeiro .zip** encontrado na pasta pública
4. A cada restart ou redeploy no Render, o backup é restaurado automaticamente

### Configuração da pasta no Drive

A pasta precisa estar **pública** (qualquer pessoa com o link pode ver):

1. Abra a pasta no Google Drive
2. Clique em **Compartilhar**
3. Em **Acesso geral**, escolha **Qualquer pessoa com o link** → **Leitor**

### Variáveis de ambiente

| Variável | Descrição |
|---|---|
| `RESTORE_BACKUP_ON_STARTUP` | `true` (padrão) restaura na inicialização; `false` desativa |
| `GOOGLE_DRIVE_FOLDER_ID` | ID da pasta (já configurado no `render.yaml`) |
| `GOOGLE_DRIVE_BACKUP_FILE_ID` | (Opcional) ID fixo de um ZIP específico |
| `GOOGLE_DRIVE_API_KEY` | (Opcional) Chave da Google Drive API para listagem mais confiável |

### Desenvolvimento local

Para rodar sem baixar do Drive:

```bash
RESTORE_BACKUP_ON_STARTUP=false npm start
```

## ❓ Dúvidas Frequentes

### Os pins ficam salvos mesmo que eu não abra o site por dias?

**SIM! Mas depende do plano escolhido no Render:**

#### ✅ Plano Starter com Disco (~US$7/mês)
- **Sim, ficam salvos para sempre!**
- Mesmo que o servidor reinicie
- Mesmo que você não abra o site por semanas
- As imagens também permanecem

#### ❌ Plano Gratuito
- **NÃO ficam salvos!**
- A cada restart do servidor (~15 min de inatividade), tudo é perdido
- Incluindo fotos e pins
- Use o backup JSON ou ZIP periodicamente como segurança

### Como saber qual plano estou usando?

1. Acesse [render.com](https://render.com)
2. Clique no seu serviço "nossa-historia"
3. Procure por **"Plan"** ou **"Disk"** na página
4. Se vir **"Starter"** e **"nossa-historia-dados"**: ✅ você tem disco persistente
5. Se vir **"Free"** e nenhum disco listado: ❌ você está no gratuito

### Posso mudar do plano gratuito para Starter?

**Sim!** No Render:
1. Vá em Settings do serviço
2. Clique em "Change Plan"
3. Escolha **Starter** e adicione o disco (2GB)
4. Confirme — pronto, dados ficam salvos!
