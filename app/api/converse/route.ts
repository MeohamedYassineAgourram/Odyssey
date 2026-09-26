import { boundedText, errorResponse, guardRequest, json, readJson, RequestError } from '../../lib/api-guard';
import { geminiConverse, localConverse, type ConverseContext, type ConverseTurn } from '../../lib/converse';
import { serverEnv } from '../../lib/server-env';
import type { CharacterId, Inventory, WorldPhase } from '../../oracle/types';

const CHARACTERS = ['lyra', 'mira', 'theron'];
const PHASES = ['ready', 'scavenge', 'shelter', 'won', 'lost'];
const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
function integer(value: unknown, field: string, maximum: number): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0 || value > maximum) throw new RequestError(`${field} must be an integer from 0 to ${maximum}.`);
  return value;
}

function contextFrom(value: unknown): ConverseContext {
  if (!object(value)) throw new RequestError('context must be an object.');
  if (typeof value.phase !== 'string' || !PHASES.includes(value.phase)) throw new RequestError('Unknown game phase.');
  if (!object(value.inventory)) throw new RequestError('context.inventory must be an object.');
  const inventory = {} as Inventory;
  for (const resource of ['food', 'water', 'herbs', 'wood'] as const) inventory[resource] = integer(value.inventory[resource], `context.inventory.${resource}`, 10_000);
  if (!Array.isArray(value.companions) || value.companions.length > 3 || value.companions.some(id => typeof id !== 'string' || !CHARACTERS.includes(id))) throw new RequestError('Unknown companions.');
  return {
    phase: value.phase as WorldPhase, day: integer(value.day, 'context.day', 5), inventory,
    companions: [...new Set(value.companions)] as CharacterId[],
    health: integer(value.health, 'context.health', 100), morale: integer(value.morale, 'context.morale', 100), signal: integer(value.signal, 'context.signal', 3),
  };
}

export async function POST(request: Request): Promise<Response> {
  try {
    guardRequest(request, 'converse', 30);
    const body = await readJson(request, 12_288);
    if (typeof body.character !== 'string' || !CHARACTERS.includes(body.character)) throw new RequestError('Choose Lyra, Mira, or Theron.');
    const character = body.character as CharacterId;
    const message = boundedText(body.message, 'message', 500);
    const context = contextFrom(body.context);
    if (body.history !== undefined && (!Array.isArray(body.history) || body.history.length > 12)) throw new RequestError('history must contain at most 12 turns.');
    const history: ConverseTurn[] = ((body.history ?? []) as unknown[]).map((turn, index) => {
      if (!object(turn) || (turn.role !== 'user' && turn.role !== 'assistant')) throw new RequestError('History roles must be user or assistant.');
      return { role: turn.role, text: boundedText(turn.text, `history[${index}].text`, 500) };
    });
    const apiKey = serverEnv('GEMINI_API_KEY');
    if (apiKey) {
      try { return json(await geminiConverse(apiKey, serverEnv('GEMINI_MODEL') || 'gemini-3.8-flash', character, message, context, history)); }
      catch { /* Keep the story playable when the provider is unavailable. */ }
    }
    return json(localConverse(character, message, context));
  } catch (error) {
    return errorResponse(error);
  }
}
