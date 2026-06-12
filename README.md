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
Por isso o **Render** é a opção mais simples — o código sobe sem refatoração.

### Deploy no Render (passo a passo)

1. Envie o projeto para o GitHub.
2. Acesse [render.com](https://render.com) e crie uma conta.
3. Clique em **New → Blueprint** e conecte o repositório.
4. O Render detecta o arquivo `render.yaml` e configura tudo automaticamente.
5. Clique em **Apply** e aguarde o deploy.

### Plano gratuito vs. disco persistente

| | Grátis | Com disco (~US$7/mês) |
|---|---|---|
| Site online | Sim | Sim |
| Fotos salvas para sempre | **Não** — perdem ao redeployar | **Sim** |
| Primeira visita após inatividade | Pode demorar ~1 min | Pode demorar ~1 min |

**Recomendação:** use o disco persistente se for guardar fotos importantes.
No `render.yaml`, a seção `disk` já está configurada — basta escolher um plano que inclua disco ao fazer o deploy.

Sem disco: exporte backup pelo site (Modo Edição → Exportar backup) de vez em quando.

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
- `GET /api/health` — verifica se o servidor está online

## Por que não Vercel?

A Vercel é ótima para sites estáticos, mas **não guarda arquivos no servidor**.
Adaptar este projeto para Vercel exigiria reescrever o backend (serverless + Vercel Blob),
configurar storage extra e tratar uploads de forma diferente — mais complexo sem benefício claro
para este tipo de app.
