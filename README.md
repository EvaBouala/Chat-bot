# Chat-bot

Projet chatbot Frontend + Backend initialise avec Vite (frontend) et Express (backend).

Le frontend affiche l'interface de chat, et le backend relaie les messages vers OpenRouter pour obtenir des reponses de modele IA.

## Aperçu

![Apercu du chatbot](Adobe%20Express%20-%20AI-chatbot.gif)

## Stack technique

- Frontend: Vite + JavaScript (Vanilla)
- Backend: Node.js + Express
- API IA: OpenRouter SDK (`@openrouter/sdk`)

## Arborescence

```text
api-ai/
	index.html
	package.json
	src/
		main.js
		style.css
		...
	server/
		server.js
		package.json
		.env            # non versionne
```

## Prerequis

- Node.js 18+ (recommande: version LTS recente)
- npm (fourni avec Node.js)
- Un compte OpenRouter avec une cle API valide

## Installation

Installe les dependances du frontend:

```bash
npm install
```

Installe les dependances du backend:

```bash
cd server
npm install
cd ..
```

## Configuration

Cree le fichier `server/.env` avec le contenu suivant:

```env
OPENROUTER_API_KEY=ta_cle_openrouter
OPENROUTER_MODEL=mistralai/mistral-small-2603
PORT=3001
```

Notes:

- Ne jamais versionner `server/.env`.
- Le modele doit etre un identifiant valide OpenRouter.

## Lancer le projet

Tu as besoin de 2 terminaux: un pour le backend, un pour le frontend.

### 1. Lancer le backend

Depuis la racine du projet:

```bash
npm --prefix server run start
```

Le backend ecoute sur `http://localhost:3001`.

### 2. Lancer le frontend

Depuis la racine du projet:

```bash
npm run dev
```

Vite affiche une URL locale (souvent `http://localhost:5173`).

## Scripts disponibles

### Frontend (`package.json` racine)

- `npm run dev`: demarrage en mode developpement
- `npm run build`: build production
- `npm run preview`: previsualisation du build

### Backend (`server/package.json`)

- `npm --prefix server run start`: demarrage API Express
- `npm --prefix server run dev`: meme commande (equivalent)

## Fonctionnement global

1. L'utilisateur ecrit un message dans le frontend.
2. Le frontend envoie `POST /api/chat` au backend avec:
   - `message`
   - `history` (historique des messages)
3. Le backend appelle OpenRouter.
4. Le backend renvoie la reponse du modele au frontend.
5. Le frontend affiche la reponse dans la conversation.

## Endpoints backend

### Health check

```http
GET /api/health
```

Reponse:

```json
{ "ok": true }
```

### Chat

```http
POST /api/chat
Content-Type: application/json
```

Corps attendu:

```json
{
  "message": "Bonjour",
  "history": [
    { "role": "user", "content": "Salut" },
    { "role": "assistant", "content": "Bonjour, comment puis-je aider ?" }
  ]
}
```

## Depannage

### 1. `npm run dev` echoue ou change de port

Ca arrive quand un autre serveur Vite tourne deja.

Solution:

- Fermer les anciens terminaux Vite
- Relancer `npm run dev`

### 2. Erreurs OpenRouter (`429`, `404`, `guardrail restrictions`)

- `429`: modele temporairement surcharge/rate limit
- `404` avec mention `guardrail restrictions`: regles Privacy trop strictes

Actions conseillees:

- Verifier `OpenRouter > Settings > Privacy`
- Assouplir les restrictions si aucun provider n'est compatible
- Verifier `OPENROUTER_MODEL`
- Si besoin, configurer BYOK (`OpenRouter > Settings > Integrations`)

### 3. Backend ne demarre pas

Verifie:

- que `server/.env` existe
- que `OPENROUTER_API_KEY` est bien renseignee
- que le port `3001` n'est pas deja occupe

## Bonnes pratiques

- Ne pas commit de cle API.
- Utiliser `.env` uniquement cote backend.
- Ne jamais exposer de secret dans le frontend.

## Auteur

Projet maintenu par EvaBouala.
