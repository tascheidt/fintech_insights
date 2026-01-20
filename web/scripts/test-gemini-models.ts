#!/usr/bin/env npx tsx
/**
 * Test which Gemini models are available for your API key
 * Run: npx tsx scripts/test-gemini-models.ts
 */

import { GoogleGenerativeAI } from "@google/generative-ai";

const MODELS_TO_TEST = [
  // Gemini 3 models (REQUIRED - always use these)
  "gemini-3-pro-preview",
  "gemini-3-flash-preview",
  // Older models (DO NOT USE - listed only for verification)
  "gemini-2.5-pro-preview-06-05",
  "gemini-2.5-flash-preview-05-20",
  "gemini-2.0-flash",
  "gemini-1.5-pro",
  "gemini-1.5-flash",
];

async function testModel(genAI: GoogleGenerativeAI, modelName: string): Promise<{ model: string; status: string; error?: string }> {
  try {
    const model = genAI.getGenerativeModel({ model: modelName });
    const result = await model.generateContent({
      contents: [{ role: "user", parts: [{ text: "Say 'OK' if you can hear me." }] }],
    });
    const response = result.response.text();
    return { model: modelName, status: "✅ AVAILABLE", error: undefined };
  } catch (error: any) {
    const errorMessage = error?.message || String(error);
    if (errorMessage.includes("quota") || errorMessage.includes("limit") || error?.status === 429) {
      return { model: modelName, status: "❌ QUOTA/LIMIT", error: "Quota exceeded or model not enabled" };
    }
    if (errorMessage.includes("not found") || errorMessage.includes("404")) {
      return { model: modelName, status: "❌ NOT FOUND", error: "Model does not exist" };
    }
    return { model: modelName, status: "❌ ERROR", error: errorMessage.substring(0, 100) };
  }
}

async function main() {
  const apiKey = process.env.GEMINI_API_KEY;
  
  if (!apiKey) {
    console.error("❌ GEMINI_API_KEY environment variable is not set");
    console.log("\nTo set it, run:");
    console.log("  export GEMINI_API_KEY=your-api-key");
    process.exit(1);
  }

  console.log("🔍 Testing Gemini API models...\n");
  console.log("API Key: " + apiKey.substring(0, 8) + "..." + apiKey.substring(apiKey.length - 4));
  console.log("═".repeat(60));

  const genAI = new GoogleGenerativeAI(apiKey);
  const results: Array<{ model: string; status: string; error?: string }> = [];

  for (const modelName of MODELS_TO_TEST) {
    process.stdout.write(`Testing ${modelName}... `);
    const result = await testModel(genAI, modelName);
    console.log(result.status);
    if (result.error) {
      console.log(`   └─ ${result.error}`);
    }
    results.push(result);
  }

  console.log("\n" + "═".repeat(60));
  console.log("📊 Summary:");
  
  const available = results.filter(r => r.status.includes("AVAILABLE"));
  const unavailable = results.filter(r => !r.status.includes("AVAILABLE"));
  
  console.log(`\n✅ Available models (${available.length}):`);
  available.forEach(r => console.log(`   - ${r.model}`));
  
  console.log(`\n❌ Unavailable models (${unavailable.length}):`);
  unavailable.forEach(r => console.log(`   - ${r.model}: ${r.error || "Unknown reason"}`));

  if (available.length === 0) {
    console.log("\n⚠️  WARNING: No models are available!");
    console.log("   Please check:");
    console.log("   1. Your API key is valid");
    console.log("   2. Billing is enabled on your Google Cloud project");
    console.log("   3. The Gemini API is enabled in your project");
    console.log("   4. Visit https://ai.google.dev/gemini-api/docs/models/gemini to see available models");
  } else {
    console.log("\n✅ Recommended model to use: " + available[0].model);
  }
}

main().catch(console.error);
