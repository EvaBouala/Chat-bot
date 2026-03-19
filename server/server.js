// NOTE: Les commentaires de ce fichier ont ete generes par IA.
// ═══════════════════════════════════════════════════════════════
//  SERVEUR CHATBOT — Express + OpenRouter
//  Rôle : exposer une API REST qui relaie les messages vers un
//         LLM via OpenRouter, avec fallback automatique sur
//         plusieurs modèles si le principal est indisponible.
// ═══════════════════════════════════════════════════════════════

// Charge les variables d'environnement depuis le fichier server/.env
// (ex : OPENROUTER_API_KEY, PORT, OPENROUTER_MODEL)
import "dotenv/config";

import express from "express";
import cors from "cors";
import { OpenRouter } from "@openrouter/sdk";

// ── Initialisation du client OpenRouter ──────────────────────────
// La clé API est lue depuis les variables d'environnement,
// jamais écrite en dur dans le code (bonne pratique de sécurité).
const openrouter = new OpenRouter({
  apiKey: process.env.OPENROUTER_API_KEY,
});

// ── Application Express ───────────────────────────────────────────
const app = express();

// Port d'écoute : 3001 par défaut, ou celui défini dans .env
const PORT = process.env.PORT || 3001;

// ── Modèle principal ─────────────────────────────────────────────
// Mistral Small 3.1 24B est utilisé en priorité (version gratuite).
// Peut être surchargé via la variable d'environnement OPENROUTER_MODEL.
const MODEL =
  process.env.OPENROUTER_MODEL ||
  "mistralai/mistral-small-3.1-24b-instruct:free";

// ── Modèles de secours (fallback) ────────────────────────────────
// Si le modèle principal est saturé (429) ou indisponible (503),
// le serveur tente ces modèles dans l'ordre, jusqu'à obtenir
// une réponse. Tous sont gratuits sur OpenRouter.
const FALLBACK_MODELS = [
  "openai/gpt-oss-20b:free",
  "qwen/qwen3-4b:free",
  "meta-llama/llama-3.2-3b-instruct:free",
];

// ── Middlewares globaux ───────────────────────────────────────────

// CORS : autorise les requêtes cross-origin (indispensable quand le
// front tourne sur un port différent du serveur, ex: 5173 vs 3001)
app.use(cors());

// Parse automatiquement le corps des requêtes en JSON
app.use(express.json());

// ════════════════════════════════════════════════════════════════
//  ROUTE GET /api/health
//  Health check : permet de vérifier que le serveur est bien
//  démarré (utile pour le monitoring ou les tests d'intégration).
// ════════════════════════════════════════════════════════════════
app.get("/api/health", (req, res) => {
  res.json({ ok: true });
});

// ════════════════════════════════════════════════════════════════
//  ROUTE POST /api/chat
//  Point d'entrée principal du chatbot.
//  Corps attendu : { message: string, history?: [{ role, content }] }
//  Réponse       : { reply: string, model: string }
// ════════════════════════════════════════════════════════════════
app.post("/api/chat", async (req, res) => {
  try {
    // ── Garde : clé API manquante ───────────────────────────────
    // Si la variable d'environnement n'est pas définie, on renvoie
    // une erreur 500 explicite plutôt que de planter silencieusement.
    if (!process.env.OPENROUTER_API_KEY) {
      return res
        .status(500)
        .json({ error: "OPENROUTER_API_KEY manquante dans server/.env" });
    }

    // ── Extraction et validation du corps ───────────────────────
    // On déstructure avec valeur par défaut pour éviter les crashes
    // si le body est undefined (ex: requête sans Content-Type).
    const { message, history = [] } = req.body ?? {};

    if (!message || typeof message !== "string") {
      return res.status(400).json({ error: "Le champ 'message' est requis." });
    }

    // ── Construction du tableau de messages ─────────────────────
    // L'API OpenRouter attend le format OpenAI : un tableau de
    // messages avec les rôles "system", "user" ou "assistant".
    //
    // On compose :
    //   1. Un message système qui définit la personnalité du bot
    //   2. Les 20 derniers messages de l'historique (contexte)
    //   3. Le nouveau message de l'utilisateur
    const messages = [
      {
        role: "system",
        content:
          "Tu es un assistant conversationnel utile, clair et concis. Reponds en francais sauf demande contraire.",
      },

      // Filtre de sécurité sur l'historique :
      //  - On n'accepte que les rôles "user" et "assistant" (pas "system")
      //    pour éviter les injections de prompt via l'historique client.
      //  - On vérifie que le contenu est bien une chaîne de caractères.
      //  - On ne garde que les 20 derniers échanges pour rester dans
      //    la fenêtre de contexte des modèles et limiter les coûts.
      ...history
        .filter(
          (m) =>
            m &&
            (m.role === "user" || m.role === "assistant") &&
            typeof m.content === "string",
        )
        .slice(-20),

      // Message actuel de l'utilisateur, ajouté en dernière position
      {
        role: "user",
        content: message,
      },
    ];

    // ── Déduplication de la liste des modèles ───────────────────
    // Si OPENROUTER_MODEL est identique à l'un des fallbacks,
    // on évite de le tenter deux fois grâce au filtre d'unicité.
    const modelCandidates = [MODEL, ...FALLBACK_MODELS].filter(
      (value, index, arr) => value && arr.indexOf(value) === index,
    );

    // Variables qui seront remplies lors de la boucle de tentatives
    let completion;
    let selectedModel = MODEL;
    let lastError;

    // ── Boucle de tentatives (modèle principal puis fallbacks) ───
    for (const modelName of modelCandidates) {
      try {
        completion = await openrouter.chat.send({
          chatGenerationParams: {
            model: modelName,
            messages,
            stream: false, // Réponse complète, pas de streaming token par token
          },
        });

        // Si on arrive ici, la requête a réussi : on sort de la boucle
        selectedModel = modelName;
        break;
      } catch (err) {
        lastError = err;

        const statusCode = Number(err?.statusCode) || 500;
        const message = String(
          err?.error?.metadata?.raw || err?.error?.message || "",
        ).toLowerCase();

        // Détecte si le modèle ne supporte pas les instructions système
        // (certains modèles ouverts ont cette limitation)
        const modelIncompatible =
          statusCode === 400 &&
          (message.includes("developer instruction is not enabled") ||
            message.includes("invalid_argument"));

        // Stratégie de fallback :
        //  - 429 : rate limit → on essaie le modèle suivant
        //  - 503 : service indisponible → on essaie le modèle suivant
        //  - 400 incompatible → on essaie le modèle suivant
        //  - Toute autre erreur → on remonte l'exception immédiatement
        //    (inutile de tenter d'autres modèles pour une erreur 401, 404, etc.)
        if (statusCode !== 429 && statusCode !== 503 && !modelIncompatible) {
          throw err;
        }
        // Sinon : on continue la boucle avec le modèle suivant
      }
    }

    // ── Aucun modèle n'a répondu ─────────────────────────────────
    if (!completion) {
      throw lastError || new Error("Aucun modele disponible");
    }

    // ── Extraction de la réponse ─────────────────────────────────
    // On suit le format standard OpenAI : choices[0].message.content
    // Le fallback "Pas de reponse du modele." couvre les cas où la
    // réponse est vide ou mal formée.
    const reply =
      completion?.choices?.[0]?.message?.content || "Pas de reponse du modele.";

    // Renvoie la réponse et le nom du modèle effectivement utilisé
    // (pratique pour le debug ou l'affichage côté client)
    return res.json({
      reply,
      model: selectedModel,
    });
  } catch (error) {
    // ════════════════════════════════════════════════════════════
    //  GESTION GLOBALE DES ERREURS
    // ════════════════════════════════════════════════════════════

    const statusCode = Number(error?.statusCode) || 500;
    const upstreamMessage =
      error?.error?.metadata?.raw || error?.error?.message;

    // Log minimal : on évite d'afficher les headers HTTP complets
    // ou des secrets qui pourraient fuiter dans les logs serveur.
    console.error("Erreur /api/chat:", {
      statusCode,
      message: upstreamMessage || "Erreur serveur interne",
    });

    // ── 429 : Rate limit ────────────────────────────────────────
    // Tous les modèles de la liste sont saturés.
    // On informe le client qu'il peut réessayer dans quelques secondes.
    if (statusCode === 429) {
      return res.status(429).json({
        error:
          "Rate limit OpenRouter temporaire sur les modeles testes. Reessaie dans quelques secondes.",
      });
    }

    // ── 404 avec restriction guardrail ──────────────────────────
    // OpenRouter peut bloquer certains providers pour des raisons
    // de confidentialité (paramètre Privacy dans les Settings).
    // On retourne un message d'erreur actionnable pour l'utilisateur.
    if (
      statusCode === 404 &&
      String(upstreamMessage || "")
        .toLowerCase()
        .includes("guardrail restrictions")
    ) {
      return res.status(404).json({
        error:
          "OpenRouter bloque les providers via Settings > Privacy. Assouplis les restrictions ou configure BYOK.",
      });
    }

    // ── Erreur générique ────────────────────────────────────────
    // Pour toutes les autres erreurs, on renvoie le code HTTP
    // d'origine et le message upstream s'il existe.
    return res
      .status(statusCode)
      .json({ error: upstreamMessage || "Erreur serveur interne" });
  }
});

// ════════════════════════════════════════════════════════════════
//  DÉMARRAGE DU SERVEUR
// ════════════════════════════════════════════════════════════════
app.listen(PORT, () => {
  console.log(`Server chatbot actif sur http://localhost:${PORT}`);
  console.log("Endpoint: POST /api/chat");
  console.log(
    "Body attendu: { message: string, history?: [{ role, content }] }",
  );
});
