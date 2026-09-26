import type { CampChoice, CampEvent, CampState, GatherResult, Inventory, Resource } from './types';

const RESOURCES: Resource[] = ['food', 'water', 'herbs', 'wood'];
const clamp = (value: number, maximum = 100) => Math.max(0, Math.min(maximum, value));

function eventFor(day: number, companions: CampState['companions']): CampEvent {
  const mira = companions.includes('mira');
  const theron = companions.includes('theron');
  const events: CampEvent[] = [
    {
      id: 'buried-cistern', title: 'The buried cistern',
      text: 'Ash settles over the sanctuary of Asterion. Beneath a cracked lion fountain, water still trickles into a sealed cistern. The first tremor has loosened its stone cover.',
      choices: [
        { id: 'filter-water', label: 'Filter the cistern', description: mira ? 'Mira uses bitter herbs to clean four jars of water.' : 'Use herbs to settle the ash from three jars of water.', cost: { herbs: 1 }, gain: { water: mira ? 4 : 3 }, morale: 4 },
        { id: 'salvage-cover', label: 'Salvage the awning', description: theron ? 'Theron braces the broken frame. Recover three bundles of wood safely.' : 'Climb the cracked fountain to recover two bundles of wood. Lose 8 health.', gain: { wood: theron ? 3 : 2 }, health: theron ? 0 : -8 },
        { id: 'gather-offerings', label: 'Gather the offerings', description: 'Recover one basket of figs from the altar and give thanks for shelter.', gain: { food: 1 }, morale: 8 },
      ],
    },
    {
      id: 'terrace-granary', title: 'The terrace granary',
      text: 'A fresh fissure splits the olive terraces. Across it, barley spills from a merchant’s granary. Every aftershock shakes more tiles from its roof.',
      choices: [
        { id: 'brace-granary', label: 'Brace the doorway', description: theron ? 'Theron reuses a fallen beam. Recover four baskets of barley without spending wood.' : 'Spend one bundle of wood on a brace and recover four baskets of barley.', cost: { wood: theron ? 0 : 1 }, gain: { food: 4 }, morale: 5 },
        { id: 'dash-granary', label: 'Run beneath the roof', description: mira ? 'Recover three baskets. Mira tends your cuts; lose 4 health.' : 'Recover three baskets before the roof falls. Lose 12 health.', gain: { food: 3 }, health: mira ? -4 : -12 },
        { id: 'pick-olives', label: 'Search the olive grove', description: 'Keep clear of the ruins. Find one basket of olives and one bundle of dry branches.', gain: { food: 1, wood: 1 }, morale: 2 },
      ],
    },
    {
      id: 'broken-procession', title: 'The broken procession',
      text: 'At dawn, a family reaches the sanctuary carrying an injured potter. They know a spring beyond the old quarry; their shattered cart could also supply the signal pyre.',
      choices: [
        { id: 'tend-potter', label: 'Tend the potter', description: mira ? 'Spend one herb. Mira saves the potter, who brings three water and two food.' : 'Spend one herb to dress the potter’s wounds. The family shares two water and one food.', cost: { herbs: 1 }, gain: { water: mira ? 3 : 2, food: mira ? 2 : 1 }, morale: 12 },
        { id: 'trade-cart', label: 'Trade for the cart', description: theron ? 'Share one food; Theron recovers four sound bundles of timber.' : 'Share one food for three bundles of cart timber.', cost: { food: 1 }, gain: { wood: theron ? 4 : 3 }, morale: 5 },
        { id: 'guide-family', label: 'Guide them to shelter', description: 'Carry their jars along the ridge. Receive one water and one healing herb, but lose 5 health.', gain: { water: 1, herbs: 1 }, health: -5, morale: 7 },
      ],
    },
    {
      id: 'black-wind', title: 'The black wind',
      text: 'The mountain exhales again. Hot ash sweeps through the columns while your beacon frame groans above the sanctuary. A bronze basin rings in the wind.',
      choices: [
        { id: 'lash-frame', label: 'Lash the beacon frame', description: theron ? 'Spend one wood. Theron strengthens the signal by one stage and seals the shelter.' : 'Spend two wood to strengthen the signal by one stage.', cost: { wood: theron ? 1 : 2 }, signal: 1, morale: 6 },
        { id: 'wet-cloths', label: 'Soak the sleeping cloths', description: mira ? 'Spend one water. Mira shields everyone from ash; recover 15 health.' : 'Spend one water to keep ash from your lungs. Recover 8 health.', cost: { water: 1 }, health: mira ? 15 : 8, morale: 5 },
        { id: 'seal-alcove', label: 'Wait in the inner alcove', description: 'Shelter behind the altar with a fallen door. Save one bundle of wood, but lose 8 health and 5 morale.', gain: { wood: 1 }, health: -8, morale: -5 },
      ],
    },
    {
      id: 'distant-sail', title: 'A sail beyond the ash',
      text: 'A pale sail appears beyond the darkened bay. The ship will pass the headland at nightfall. Your beacon must burn high enough to guide its crew through the pumice.',
      choices: [
        { id: 'raise-beacon', label: 'Raise the final beacon', description: 'Spend two wood to add one stage to the signal. Rescue needs all three stages.', cost: { wood: 2 }, signal: 1, morale: 10 },
        { id: 'share-last-meal', label: 'Share a quiet meal', description: 'Spend one food to restore 10 health and 15 morale before the final night.', cost: { food: 1 }, health: 10, morale: 15 },
        { id: 'comb-shore', label: 'Comb the high shore', description: 'Find two bundles of driftwood for the beacon. Sharp pumice costs 6 health.', gain: { wood: 2 }, health: -6, morale: 3 },
      ],
    },
  ];
  return events[Math.max(0, Math.min(4, day - 1))];
}

export function createCamp(result: GatherResult): CampState {
  const inventory = Object.fromEntries(RESOURCES.map(resource => {
    const quantity = result.inventory[resource];
    return [resource, Number.isFinite(quantity) ? Math.max(0, Math.floor(quantity)) : 0];
  })) as Inventory;
  const companions = [...new Set(result.companions.filter(id => id === 'mira' || id === 'theron'))];
  return {
    day: 1, inventory, companions, health: result.escaped ? 100 : 0, morale: 70, signal: 0,
    chosen: false, outcome: result.escaped ? 'playing' : 'lost', event: eventFor(1, companions),
    log: [result.escaped ? 'Day 1: You reached the sanctuary. Keep the party alive for five days and raise the signal to three stages.' : 'The ash cloud reached you before you found shelter.'],
  };
}

export function choiceDisabledReason(state: CampState, choice: CampChoice): string | null {
  if (state.outcome !== 'playing') return 'This journey has ended.';
  if (state.chosen) return 'You have already made today’s decision.';
  const available = state.event.choices.find(item => item.id === choice.id);
  if (!available) return 'This choice is unavailable.';
  for (const resource of RESOURCES) {
    const cost = available.cost?.[resource] ?? 0;
    if (state.inventory[resource] < cost) return `Needs ${cost} ${resource}.`;
  }
  return null;
}

export function canChoose(state: CampState, choice: CampChoice): boolean {
  return choiceDisabledReason(state, choice) === null;
}

export function chooseCamp(state: CampState, choiceId: string): CampState {
  const choice = state.event.choices.find(item => item.id === choiceId);
  if (!choice || !canChoose(state, choice)) return state;
  const inventory = { ...state.inventory };
  for (const resource of RESOURCES) inventory[resource] = Math.max(0, inventory[resource] - (choice.cost?.[resource] ?? 0) + (choice.gain?.[resource] ?? 0));
  const health = clamp(state.health + (choice.health ?? 0));
  return {
    ...state, inventory, health, morale: clamp(state.morale + (choice.morale ?? 0)),
    signal: clamp(state.signal + (choice.signal ?? 0), 3), chosen: true,
    outcome: health > 0 ? 'playing' : 'lost',
    log: [...state.log, `Day ${state.day}: ${choice.label}. ${choice.description}`, ...(health === 0 ? ['Your wounds proved too severe to survive.'] : [])],
  };
}

export function performCampAction(state: CampState, action: 'repair' | 'heal'): CampState {
  if (state.outcome !== 'playing') return state;
  if (action === 'repair' && state.signal < 3 && state.inventory.wood >= 2) {
    return { ...state, inventory: { ...state.inventory, wood: state.inventory.wood - 2 }, signal: state.signal + 1, log: [...state.log, `Day ${state.day}: Spent 2 wood to raise the signal to ${state.signal + 1}/3.`] };
  }
  if (action === 'heal' && state.health < 100 && state.inventory.herbs >= 1) {
    return { ...state, inventory: { ...state.inventory, herbs: state.inventory.herbs - 1 }, health: clamp(state.health + 20), log: [...state.log, `Day ${state.day}: Used 1 herb to restore ${Math.min(20, 100 - state.health)} health.`] };
  }
  return state;
}

export function endDay(state: CampState, rations: { food: boolean; water: boolean }): CampState {
  if (state.outcome !== 'playing' || !state.chosen) return state;
  const food = rations.food && state.inventory.food >= 1;
  const water = rations.water && state.inventory.water >= 1;
  const health = clamp(state.health - (food ? 0 : 14) - (water ? 0 : 22));
  const morale = clamp(state.morale + (food && water ? 4 : 0) - (food ? 0 : 7) - (water ? 0 : 10));
  const inventory = { ...state.inventory, food: state.inventory.food - Number(food), water: state.inventory.water - Number(water) };
  const lastDay = state.day >= 5;
  const outcome = health === 0 ? 'lost' : lastDay ? (state.signal >= 3 ? 'won' : 'lost') : 'playing';
  const day = outcome === 'playing' ? state.day + 1 : state.day;
  const rationLog = food && water ? 'The party shared 1 food and 1 water and survived the night.' : `${food ? 'The party ate.' : 'No food: −14 health, −7 morale.'} ${water ? 'The party drank.' : 'No water: −22 health, −10 morale.'}`;
  const ending = outcome === 'won' ? ['The three-stage beacon blazes. A ship follows its light and carries you away from the dying island.'] : outcome === 'lost' ? [health === 0 ? 'The party could not survive another night.' : 'The ship passed beyond the headland. The unfinished beacon could not reach it.'] : [];
  return { ...state, day, inventory, health, morale, outcome, chosen: outcome === 'playing' ? false : state.chosen, event: outcome === 'playing' ? eventFor(day, state.companions) : state.event, log: [...state.log, `Night ${state.day}: ${rationLog}`, ...ending] };
}
