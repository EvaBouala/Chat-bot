import "dotenv/config";

import cors from "cors";
import express from "express";
import { OpenRouter } from "@openrouter/sdk";

const app = express();
const PORT = process.env.PORT || 3001;

const MODEL =
  process.env.OPENROUTER_MODEL ||
  "mistralai/mistral-small-3.1-24b-instruct:free";

const FALLBACK_MODELS = [
  "openai/gpt-oss-20b:free",
  "qwen/qwen3-4b:free",
  "meta-llama/llama-3.2-3b-instruct:free",
];

const openrouter = new OpenRouter({
  apiKey: process.env.OPENROUTER_API_KEY,
});

function looksLikeNoMemoryReply(text) {
  const value = String(text || "").toLowerCase();
  return (
    value.includes("je ne me souviens pas") ||
    value.includes("chaque echange est independant") ||
    value.includes("chaque échange est indépendant") ||
    value.includes("je n'ai pas de memoire") ||
    value.includes("je n'ai pas de mémoire") ||
    value.includes("une fois que tu quittes la session")
  );
}

app.use(cors());
app.use(express.json());

app.get("/api/health", (req, res) => {
  res.json({ ok: true });
});

app.post("/api/chat", async (req, res) => {
  try {
    if (!process.env.OPENROUTER_API_KEY) {
      return res
        .status(500)
        .json({ error: "OPENROUTER_API_KEY manquante dans server/.env" });
    }

    const {
      message,
      history = [],
      memoryFacts = [],
      systemOverride,
    } = req.body ?? {};

    if (!message || typeof message !== "string") {
      return res.status(400).json({ error: "Le champ 'message' est requis." });
    }

    const cleanHistory = Array.isArray(history)
      ? history
          .filter(
            (m) =>
              m &&
              (m.role === "user" || m.role === "assistant") &&
              typeof m.content === "string",
          )
          .slice(-20)
      : [];

    const cleanMemoryFacts = Array.isArray(memoryFacts)
      ? memoryFacts
          .filter((fact) => typeof fact === "string")
          .map((fact) => fact.trim())
          .filter(Boolean)
          .slice(-30)
      : [];

    const memoryBlock = cleanMemoryFacts.length
      ? `\n\nMemoire globale utilisateur (faits persistants):\n${cleanMemoryFacts
          .map((fact) => `- ${fact}`)
          .join(
            "\n",
          )}\nUtilise ces informations uniquement si elles sont pertinentes.`
      : "";

    const baseSystemPrompt =
      "Tu es un assistant conversationnel utile, clair et concis. Reponds en francais sauf demande contraire. " +
      "Tu disposes d'une memoire globale utilisateur. Quand la question porte sur des informations deja partagees, utilise prioritairement cette memoire. " +
      "N'affirme jamais que tu ne te souviens pas si des faits memoires sont fournis.";

    const messages = [
      {
        role: "system",
        content: systemOverride
          ? String(systemOverride)
          : baseSystemPrompt + memoryBlock,
      },
      ...cleanHistory,
      {
        role: "user",
        content: message,
      },
    ];

    const modelCandidates = [MODEL, ...FALLBACK_MODELS].filter(
      (value, index, arr) => value && arr.indexOf(value) === index,
    );

    let completion;
    let selectedModel = MODEL;
    let lastError;

    for (const modelName of modelCandidates) {
      try {
        completion = await openrouter.chat.send({
          chatGenerationParams: {
            model: modelName,
            messages,
            stream: false,
          },
        });
        selectedModel = modelName;
        break;
      } catch (err) {
        lastError = err;

        const statusCode = Number(err?.statusCode) || 500;
        const rawMessage = String(
          err?.error?.metadata?.raw || err?.error?.message || "",
        ).toLowerCase();

        const modelIncompatible =
          statusCode === 400 &&
          (rawMessage.includes("developer instruction is not enabled") ||
            rawMessage.includes("invalid_argument"));

        if (statusCode !== 429 && statusCode !== 503 && !modelIncompatible) {
          throw err;
        }
      }
    }

    if (!completion) {
      throw lastError || new Error("Aucun modele disponible");
    }

    let reply =
      completion?.choices?.[0]?.message?.content || "Pas de reponse du modele.";

    if (cleanMemoryFacts.length > 0 && looksLikeNoMemoryReply(reply)) {
      const recall = cleanMemoryFacts
        .slice(-3)
        .map((fact) => `- ${fact}`)
        .join("\n");
      reply =
        "Je me souviens d'informations de nos precedentes conversations. " +
        "Par exemple:\n" +
        `${recall}\n` +
        "Si tu veux, je peux m'appuyer dessus pour personnaliser ma reponse.";
    }

    return res.json({
      reply,
      model: selectedModel,
    });
  } catch (error) {
    const statusCode = Number(error?.statusCode) || 500;
    const upstreamMessage =
      error?.error?.metadata?.raw || error?.error?.message;

    console.error("Erreur /api/chat:", {
      statusCode,
      message: upstreamMessage || "Erreur serveur interne",
    });

    if (statusCode === 429) {
      return res.status(429).json({
        error:
          "Rate limit OpenRouter temporaire sur les modeles testes. Reessaie dans quelques secondes.",
      });
    }

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

    return res
      .status(statusCode)
      .json({ error: upstreamMessage || "Erreur serveur interne" });
  }
});

app.listen(PORT, () => {
  console.log(`Server chatbot actif sur http://localhost:${PORT}`);
  console.log("Endpoint: POST /api/chat");
  console.log(
    "Body attendu: { message: string, history?: [{ role, content }], memoryFacts?: string[], systemOverride?: string }",
  );
});
