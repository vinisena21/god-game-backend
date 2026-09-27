/**
 * Sistema de Energia Divina + Cooldowns
 *
 * - Energia global (0–100), regenera a cada tick do loop
 * - Cada intervenção tem custo e cooldown em ticks
 * - Bênçãos têm cooldown por agente (evita spam no mesmo cidadão)
 */

export type DivineActionType =
  | 'RAIO'
  | 'MILAGRE'
  | 'BLESS_HEAL'
  | 'BLESS_FOOD'
  | 'BLESS_WATER'
  | 'BLESS_RESOURCES'
  | 'BLESS_FULL'
  | 'BLESS_MESSAGE';

interface ActionConfig {
  cost: number;
  cooldownTicks: number;
  label: string;
}

const ACTION_CONFIG: Record<DivineActionType, ActionConfig> = {
  RAIO: { cost: 25, cooldownTicks: 4, label: 'Raio' },
  MILAGRE: { cost: 15, cooldownTicks: 3, label: 'Milagre (Árvore)' },
  BLESS_HEAL: { cost: 12, cooldownTicks: 3, label: 'Cura' },
  BLESS_FOOD: { cost: 10, cooldownTicks: 2, label: 'Comida' },
  BLESS_WATER: { cost: 10, cooldownTicks: 2, label: 'Água' },
  BLESS_RESOURCES: { cost: 15, cooldownTicks: 3, label: 'Recursos' },
  BLESS_FULL: { cost: 35, cooldownTicks: 6, label: 'Bênção Completa' },
  BLESS_MESSAGE: { cost: 5, cooldownTicks: 1, label: 'Mensagem' },
};

const MAX_ENERGY = 100;
const REGEN_PER_TICK = 4; // ~1 energia por segundo (tick = 2.5s)

/** Estado em memória do processo (não precisa de migration no banco) */
let energy = MAX_ENERGY;
let currentTick = 0;

/** Último tick em que cada tipo de ação global foi usada */
const globalLastUsed: Partial<Record<DivineActionType, number>> = {};

/** Último tick de bênção por agente: agentId → action → tick */
const agentLastBlessing: Map<number, Partial<Record<DivineActionType, number>>> = new Map();

export function syncTick(tick: number) {
  // Regenera energia a cada avanço de tick
  if (tick > currentTick) {
    const delta = tick - currentTick;
    energy = Math.min(MAX_ENERGY, energy + delta * REGEN_PER_TICK);
    currentTick = tick;
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
    cooldowns, // action → ticks restantes
    costs: Object.fromEntries(
      Object.entries(ACTION_CONFIG).map(([k, v]) => [k, v.cost])
    ) as Record<DivineActionType, number>,
  };
}

export interface DivineCheckResult {
  ok: boolean;
  error?: string;
  cost?: number;
  cooldownRemaining?: number;
}

/** Verifica se a ação pode ser executada (sem consumir ainda) */
export function canPerform(
  action: DivineActionType,
  agentId?: number
): DivineCheckResult {
  const cfg = ACTION_CONFIG[action];
  if (!cfg) return { ok: false, error: 'Ação divina desconhecida' };

  // Cooldown global da ação
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

  // Cooldown por agente (só bênçãos)
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

  // Energia
  if (energy < cfg.cost) {
    return {
      ok: false,
      error: `Energia divina insuficiente (precisa ${cfg.cost}, tem ${Math.round(energy)})`,
      cost: cfg.cost,
    };
  }

  return { ok: true, cost: cfg.cost };
}

/** Consome energia e registra cooldowns. Chamar só após canPerform ok. */
export function consume(action: DivineActionType, agentId?: number): void {
  const cfg = ACTION_CONFIG[action];
  energy = Math.max(0, energy - cfg.cost);
  globalLastUsed[action] = currentTick;

  if (agentId != null && action.startsWith('BLESS_')) {
    const map = agentLastBlessing.get(agentId) || {};
    map[action] = currentTick;
    agentLastBlessing.set(agentId, map);
  }
}

/** Reseta energia e cooldowns (usado no reset do mundo) */
export function resetDivinePower(): void {
  energy = MAX_ENERGY;
  currentTick = 0;
  for (const key of Object.keys(globalLastUsed) as DivineActionType[]) {
    delete globalLastUsed[key];
  }
  agentLastBlessing.clear();
}

export function mapBlessingToAction(
  blessing?: string
): DivineActionType {
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
