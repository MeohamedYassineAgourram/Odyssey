import { boundedText, errorResponse, guardRequest, json, readJson, RequestError } from '../../../lib/api-guard';
import { geminiTroyConverse, localTroyConverse, type TroyConverseContext, type TroyConverseTurn } from '../../../lib/troy-converse';
import { serverEnv } from '../../../lib/server-env';
import { BLUEPRINTS, MISSIONS, PLOTS, RUN_DURATION } from '../../../troy/config';
import type { BuildingKind, CharacterId, Materials, TroyPhase } from '../../../troy/types';

const CHARACTERS = ['lyra', 'mira', 'theron'];
const PHASES = ['ready', 'playing', 'disaster', 'ended'];
const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);

function boundedNumber(value: unknown, field: string, maximum: number, integer = true): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > maximum || (integer && !Number.isInteger(value))) {
    throw new RequestError(`${field} must be ${integer ? 'an integer' : 'a number'} from 0 to ${maximum}.`);
  }
  return value;
}

function contextFrom(value: unknown): TroyConverseContext {
  if (!object(value)) throw new RequestError('context must be an object.');
  if (typeof value.phase !== 'string' || !PHASES.includes(value.phase)) throw new RequestError('Unknown game phase.');
  if (!object(value.materials)) throw new RequestError('context.materials must be an object.');
  const materials = {} as Materials;
  for (const resource of ['wood', 'stone', 'bronze'] as const) materials[resource] = boundedNumber(value.materials[resource], `context.materials.${resource}`, 10_000);
  if (typeof value.selected !== 'string' || !BLUEPRINTS.some(blueprint => blueprint.id === value.selected)) throw new RequestError('Choose a known blueprint.');
  return {
    phase: value.phase as TroyPhase, timeLeft: boundedNumber(value.timeLeft, 'context.timeLeft', RUN_DURATION, false),
    health: boundedNumber(value.health, 'context.health', 100, false), materials,
    buildings: boundedNumber(value.buildings, 'context.buildings', PLOTS.length),
    missions: boundedNumber(value.missions, 'context.missions', MISSIONS.length),
    kills: boundedNumber(value.kills, 'context.kills', 10_000), selected: value.selected as BuildingKind,
  };
}

export async function POST(request: Request): Promise<Response> {
  try {
    guardRequest(request, 'troy-converse', 30);
    const body = await readJson(request, 12_288);
    if (typeof body.character !== 'string' || !CHARACTERS.includes(body.character)) throw new RequestError('Choose Lyra, Mira, or Theron.');
    const character = body.character as CharacterId;
    const message = boundedText(body.message, 'message', 500);
    const context = contextFrom(body.context);
    if (body.history !== undefined && (!Array.isArray(body.history) || body.history.length > 12)) throw new RequestError('history must contain at most 12 turns.');
    const history: TroyConverseTurn[] = ((body.history ?? []) as unknown[]).map((turn, index) => {
      if (!object(turn) || (turn.role !== 'user' && turn.role !== 'assistant')) throw new RequestError('History roles must be user or assistant.');
      return { role: turn.role, text: boundedText(turn.text, `history[${index}].text`, 500) };
    });
    const apiKey = serverEnv('GEMINI_API_KEY');
    if (apiKey) {
      try { return json(await geminiTroyConverse(apiKey, serverEnv('GEMINI_MODEL') || 'gemini-3.8-flash', character, message, context, history)); }
      catch { /* Local advice keeps the city playable when the provider is unavailable. */ }
    }
    return json(localTroyConverse(character, message, context));
  } catch (error) {
    return errorResponse(error);
  }
}
