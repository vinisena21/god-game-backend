/**
 * Energia Divina + Cooldowns + Magia Elementar
 *
 * Elementos:
 *  FOGO  — queima área (dano, destrói árvores)
 *  AGUA  — hidrata e cura leve na área
 *  TERRA — ergue jazida / recursos no ponto
 *  AR    — empurra agentes e pode mudar clima
 *  VIDA  — faz brotar árvores e cura leve
 */

export type DivineActionType =
  | 'RAIO'
  | 'MILAGRE'
  | 'ELEM_FOGO'
  | 'ELEM_AGUA'
  | 'ELEM_TERRA'
  | 'ELEM_AR'
  | 'ELEM_VIDA'
  | 'BLESS_HEAL'
  | 'BLESS_FOOD'
  | 'BLESS_WATER'
  | 'BLESS_RESOURCES'
  | 'BLESS_FULL'
  | 'BLESS_MESSAGE';

export type ElementType = 'FOGO' | 'AGUA' | 'TERRA' | 'AR' | 'VIDA';

interface ActionConfig {
  cost: number;
  cooldownTicks: number;
  label: string;
  /** Raio de efeito no mapa (unidades 0–100), se aplicável */
  radius?: number;
}

const ACTION_CONFIG: Record<DivineActionType, ActionConfig> = {
  RAIO: { cost: 25, cooldownTicks: 4, label: 'Raio', radius: 5 },
  MILAGRE: { cost: 15, cooldownTicks: 3, label: 'Milagre (Árvore)' },

  ELEM_FOGO: { cost: 22, cooldownTicks: 5, label: '🔥 Fogo', radius: 8 },
  ELEM_AGUA: { cost: 18, cooldownTicks: 4, label: '💧 Água', radius: 10 },
  ELEM_TERRA: { cost: 20, cooldownTicks: 5, label: '🪨 Terra', radius: 4 },
  ELEM_AR: { cost: 16, cooldownTicks: 4, label: '💨 Ar', radius: 12 },
  ELEM_VIDA: { cost: 20, cooldownTicks: 5, label: '🌿 Vida', radius: 7 },

  BLESS_HEAL: { cost: 12, cooldownTicks: 3, label: 'Cura' },
  BLESS_FOOD: { cost: 10, cooldownTicks: 2, label: 'Comida' },
  BLESS_WATER: { cost: 10, cooldownTicks: 2, label: 'Água' },
  BLESS_RESOURCES: { cost: 15, cooldownTicks: 3, label: 'Recursos' },
  BLESS_FULL: { cost: 35, cooldownTicks: 6, label: 'Bênção Completa' },
  BLESS_MESSAGE: { cost: 5, cooldownTicks: 1, label: 'Mensagem' },
};

/** Multiplicador de custo conforme clima atual */
export function weatherCostMultiplier(element: ElementType, weather: string): number {
  const w = (weather || '').toLowerCase();
  switch (element) {
    case 'FOGO':
      if (w.includes('sol') || w.includes('ensolarado')) return 0.75; // mais barato
      if (w.includes('chuva') || w.includes('tempestade')) return 1.4; // mais caro
      return 1;
    case 'AGUA':
      if (w.includes('chuva') || w.includes('tempestade')) return 0.7;
      if (w.includes('sol') || w.includes('ensolarado')) return 1.25;
      return 1;
    case 'AR':
      if (w.includes('tempestade') || w.includes('nublado')) return 0.8;
      return 1;
    case 'TERRA':
      return 1;
    case 'VIDA':
      if (w.includes('chuva')) return 0.85;
      if (w.includes('tempestade')) return 1.15;
      return 1;
    default:
      return 1;
  }
}

const MAX_ENERGY = 100;
const REGEN_PER_TICK = 4;

let energy = MAX_ENERGY;
let currentTick = 0;

const globalLastUsed: Partial<Record<DivineActionType, number>> = {};
const agentLastBlessing: Map<number, Partial<Record<DivineActionType, number>>> = new Map();

/** Último feitiço elementar lançado (para feedback visual no front) */
let lastElementalCast: {
  element: ElementType;
  x: number;
  y: number;
  radius: number;
  tick: number;
} | null = null;

export function syncTick(tick: number) {
  if (tick > currentTick) {
    const delta = tick - currentTick;
    energy = Math.min(MAX_ENERGY, energy + delta * REGEN_PER_TICK);
    currentTick = tick;
  }
  // Limpa efeito visual antigo
  if (lastElementalCast && tick - lastElementalCast.tick > 3) {
    lastElementalCast = null;
  }
}

export function getDivineState() {
  const cooldowns: Record<string, number> = {};

  for (const [action, cfg] of Object.entries(ACTION_CONFIG) as [DivineActionType, ActionConfig][]) {
    const last = globalLastUsed[action] ?? -999;
    const remaining = Math.max(0, cfg.cooldownTicks - (currentTick - last));
    if (remaining > 0) cooldowns[action] = remaining;
  }

  return {
    energy: Math.round(energy),
    maxEnergy: MAX_ENERGY,
    regenPerTick: REGEN_PER_TICK,
    cooldowns,
    costs: Object.fromEntries(
      Object.entries(ACTION_CONFIG).map(([k, v]) => [k, v.cost])
    ) as Record<string, number>,
    radii: Object.fromEntries(
      Object.entries(ACTION_CONFIG)
        .filter(([, v]) => v.radius != null)
        .map(([k, v]) => [k, v.radius])
    ) as Record<string, number>,
    lastCast: lastElementalCast,
    elements: ['FOGO', 'AGUA', 'TERRA', 'AR', 'VIDA'] as ElementType[],
  };
}

export interface DivineCheckResult {
  ok: boolean;
  error?: string;
  cost?: number;
  cooldownRemaining?: number;
}

export function canPerform(
  action: DivineActionType,
  agentId?: number,
  weather?: string
): DivineCheckResult {
  const cfg = ACTION_CONFIG[action];
  if (!cfg) return { ok: false, error: 'Ação divina desconhecida' };

  const lastGlobal = globalLastUsed[action] ?? -999;
  const globalRemaining = cfg.cooldownTicks - (currentTick - lastGlobal);
  if (globalRemaining > 0) {
    return {
      ok: false,
      error: `${cfg.label} em cooldown (${globalRemaining} tick${globalRemaining > 1 ? 's' : ''})`,
      cooldownRemaining: globalRemaining,
      cost: cfg.cost,
    };
  }

  if (agentId != null && action.startsWith('BLESS_')) {
    const agentMap = agentLastBlessing.get(agentId) || {};
    const lastAgent = agentMap[action] ?? -999;
    const agentRemaining = cfg.cooldownTicks - (currentTick - lastAgent);
    if (agentRemaining > 0) {
      return {
        ok: false,
        error: `Este agente já recebeu ${cfg.label} recentemente (${agentRemaining} tick${agentRemaining > 1 ? 's' : ''})`,
        cooldownRemaining: agentRemaining,
        cost: cfg.cost,
      };
    }
  }

  let cost = cfg.cost;
  if (action.startsWith('ELEM_') && weather) {
    const el = action.replace('ELEM_', '') as ElementType;
    cost = Math.round(cost * weatherCostMultiplier(el, weather));
  }

  if (energy < cost) {
    return {
      ok: false,
      error: `Energia divina insuficiente (precisa ${cost}, tem ${Math.round(energy)})`,
      cost,
    };
  }

  return { ok: true, cost };
}

export function consume(
  action: DivineActionType,
  agentId?: number,
  actualCost?: number
): void {
  const cfg = ACTION_CONFIG[action];
  const cost = actualCost ?? cfg.cost;
  energy = Math.max(0, energy - cost);
  globalLastUsed[action] = currentTick;

  if (agentId != null && action.startsWith('BLESS_')) {
    const map = agentLastBlessing.get(agentId) || {};
    map[action] = currentTick;
    agentLastBlessing.set(agentId, map);
  }
}

export function recordElementalCast(
  element: ElementType,
  x: number,
  y: number
): void {
  const action = `ELEM_${element}` as DivineActionType;
  const radius = ACTION_CONFIG[action]?.radius ?? 8;
  lastElementalCast = { element, x, y, radius, tick: currentTick };
}

export function resetDivinePower(): void {
  energy = MAX_ENERGY;
  currentTick = 0;
  lastElementalCast = null;
  for (const key of Object.keys(globalLastUsed) as DivineActionType[]) {
    delete globalLastUsed[key];
  }
  agentLastBlessing.clear();
}

export function mapBlessingToAction(blessing?: string): DivineActionType {
  switch (blessing) {
    case 'heal':
      return 'BLESS_HEAL';
    case 'food':
      return 'BLESS_FOOD';
    case 'water':
      return 'BLESS_WATER';
    case 'resources':
      return 'BLESS_RESOURCES';
    case 'full':
      return 'BLESS_FULL';
    default:
      return 'BLESS_MESSAGE';
  }
}

export function mapElementToAction(element: string): DivineActionType | null {
  const map: Record<string, DivineActionType> = {
    FOGO: 'ELEM_FOGO',
    AGUA: 'ELEM_AGUA',
    TERRA: 'ELEM_TERRA',
    AR: 'ELEM_AR',
    VIDA: 'ELEM_VIDA',
  };
  return map[element.toUpperCase()] ?? null;
}

export function getActionRadius(action: DivineActionType): number {
  return ACTION_CONFIG[action]?.radius ?? 5;
}
