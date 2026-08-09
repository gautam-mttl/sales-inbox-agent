/**
 * Gemini API client — singleton using @google/generative-ai (stable v1 SDK).
 *
 * Uses the v1 stable API endpoint, which exposes gemini-1.5-flash (1500 RPD
 * free tier) and other production models. The v2 SDK (@google/genai) uses the
 * v1beta endpoint where gemini-1.5-flash is not available.
 *
 * Model preference (overridable via GEMINI_MODEL env var):
 *   gemini-1.5-flash — 15 RPM, 1500 RPD on free tier; best balance of
 *   quality, speed, and quota for this use case.
 */

import { GoogleGenerativeAI } from "@google/generative-ai";
import { env } from "../config/env";

// ─── Client singleton ─────────────────────────────────────────────────────────

let _genAI: GoogleGenerativeAI | null = null;

export function getGenAI(): GoogleGenerativeAI {
  if (!_genAI) {
    _genAI = new GoogleGenerativeAI(env.GEMINI_API_KEY);
  }
  return _genAI;
}

/** Gemini model name from env (default: gemini-1.5-flash). */
export function getGeminiModel(): string {
  return env.GEMINI_MODEL;
}
