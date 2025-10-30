#!/usr/bin/env node
import OpenAI from "openai";

// TEMP key for testing only. Do not commit this.
const client = new OpenAI({ apiKey: "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" });

async function rate(text) {
  const completion = await client.chat.completions.create({
    model: "gpt-4o-mini",          // use a model your account can access
    temperature: 0,
    messages: [
      { role: "system", content: "Output ONLY a single integer 0–99." },
      { role: "user", content: `Rate this text’s happiness 0–99 (higher=happier). If empty, return 50.\n\nText:\n<<<${text}>>>` }
    ]
  });

  const raw = completion.choices[0].message.content.trim();
  const n = parseInt(raw, 10);
  if (Number.isNaN(n)) throw new Error(`Non-numeric response: "${raw}"`);
  console.log(n);
}

const input = process.argv.slice(2).join(" ") || "HELlOOOO ;) I am a very happy story. I love everyone!";
rate(input).catch(err => {
  if (err.code === "insufficient_quota") {
    console.error("Quota exceeded. Add credit or switch to an allowed model."); // see docs
  } else {
    console.error(err);
  }
  process.exit(1);
});


console.log("Hello, Node2!");

