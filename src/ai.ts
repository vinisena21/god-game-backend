import OpenAI from 'openai';
import dotenv from 'dotenv';

dotenv.config();

const apiKey = process.env.GROQ_API_KEY;
if (!apiKey) {
  console.warn('⚠️ GROQ_API_KEY ausente — usando cérebro local.');
}

const groq = new OpenAI({
  apiKey: apiKey || 'dummy',
  baseURL: 'https://api.groq.com/openai/v1',
});

const TARGET_MODEL = 'llama-3.3-70b-versatile';
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export interface AgentStats {
  name: string;
  personality?: string;
  hp: number;
  food: number;
  water: number;
  wood?: number;
  iron?: number;
  society?: string;
}

export interface AgentDecision {
  acao: string;
  memoria: string | null;
  oracao: string | null;
  goal?: 'HUNT' | 'DRINK' | 'HEAL' | 'BUILD' | 'EXPLORE' | 'FLEE' | 'SOCIAL';
}

export interface SocialOutcome {
  action: 'ALIANÇA' | 'CONFLITO' | 'COMÉRCIO' | 'DIÁLOGO' | 'TROCA';
  message: string;
  relationChange: number;
  newSociety?: string;
  trade?: { food?: number; water?: number; wood?: number };
}

export function localBrain(agent: AgentStats, weather: string): AgentDecision {
  const w = (weather || '').toLowerCase();
  const desperate = agent.hp < 30 || agent.food < 12 || agent.water < 12;

  if (agent.hp < 25) {
    return {
      acao: 'Procura abrigo e descansa para recuperar forças.',
      memoria: 'Estou ferido. Sobrevivência primeiro.',
      oracao: desperate ? 'Criador, cure minhas feridas...' : null,
      goal: 'HEAL',
    };
  }
  if (agent.water < 15) {
    return {
      acao: w.includes('chuva') ? 'Coleta água da chuva.' : 'Corre em direção ao rio central.',
      memoria: 'A sede queima a garganta.',
      oracao: desperate ? 'Envie água, senhor da ilha!' : null,
      goal: 'DRINK',
    };
  }
  if (agent.food < 18) {
    return {
      acao: 'Rastreia presas e prepara caçada urgente.',
      memoria: 'O estômago ruge. Caçar ou morrer.',
      oracao: desperate ? 'Conceda-me uma presa, Criador!' : null,
      goal: 'HUNT',
    };
  }
  if ((agent.wood || 0) >= 40) {
    return {
      acao: 'Busca terreno seco longe do rio para construir.',
      memoria: 'Madeira suficiente — hora de abrigo.',
      oracao: null,
      goal: 'BUILD',
    };
  }
  if (w.includes('tempestade')) {
    return {
      acao: 'Abriga-se e evita áreas abertas.',
      memoria: 'Tempestade — manter-se baixo.',
      oracao: 'Proteja-nos desta tempestade.',
      goal: 'FLEE',
    };
  }
  if (agent.society && agent.society !== 'Nenhuma' && Math.random() < 0.3) {
    return {
      acao: `Patrulha o território da ${agent.society}.`,
      memoria: 'Unidos somos mais fortes.',
      oracao: null,
      goal: 'SOCIAL',
    };
  }
  if ((agent.wood || 0) < 20) {
    return {
      acao: 'Procura árvores anciãs para madeira.',
      memoria: 'Recursos hoje, segurança amanhã.',
      oracao: null,
      goal: 'EXPLORE',
    };
  }
  return {
    acao: `Explora a ilha com cautela sob ${weather}.`,
    memoria: 'Observo, aprendo, sobrevivo.',
    oracao: Math.random() < 0.08 ? 'Vigie sobre esta ilha, Criador.' : null,
    goal: 'EXPLORE',
  };
}

export async function getAgentDecision(
  agent: AgentStats | string,
  personality?: string,
  weather?: string,
  worldEvents?: string
): Promise<AgentDecision> {
  const stats: AgentStats =
    typeof agent === 'string'
      ? { name: agent, personality, hp: 70, food: 40, water: 40 }
      : agent;
  const w = weather || 'Ensolarado';
  const events = worldEvents || '';
  const local = localBrain(stats, w);

  if (!apiKey) return local;

  const fullPrompt = `
Você é ${stats.name}, habitante de uma ilha divina.
Personalidade: ${stats.personality || personality || 'Sobrevivente'}
Estado: HP=${stats.hp} comida=${stats.food} água=${stats.water} madeira=${stats.wood ?? 0} ferro=${stats.iron ?? 0} sociedade=${stats.society || 'Nenhuma'}
Clima: ${w}
Eventos:
${events || 'Silêncio.'}
Instinto local: "${local.acao}" (goal=${local.goal})
Priorize: 1) não morrer 2) recursos 3) sociedade 4) explorar
JSON: {"acao":"...","memoria":"...","oracao":string|null,"goal":"HUNT|DRINK|HEAL|BUILD|EXPLORE|FLEE|SOCIAL"}
`;

  let tentativas = 2;
  while (tentativas > 0) {
    try {
      const response = await groq.chat.completions.create({
        model: TARGET_MODEL,
        messages: [{ role: 'user', content: fullPrompt }],
        response_format: { type: 'json_object' },
        temperature: 0.7,
        max_tokens: 280,
      });
      const parsed = JSON.parse(response.choices[0]?.message?.content || '{}');
      const goals = ['HUNT', 'DRINK', 'HEAL', 'BUILD', 'EXPLORE', 'FLEE', 'SOCIAL'];
      return {
        acao: parsed.acao ? String(parsed.acao).slice(0, 180) : local.acao,
        memoria: parsed.memoria ? String(parsed.memoria).slice(0, 180) : local.memoria,
        oracao:
          parsed.oracao && parsed.oracao !== 'null' ? String(parsed.oracao).slice(0, 140) : local.oracao,
        goal: goals.includes(parsed.goal) ? parsed.goal : local.goal,
      };
    } catch (err: any) {
      if (err?.status === 429 || String(err).includes('429')) {
        tentativas--;
        if (tentativas > 0) await sleep(5000);
      } else {
        console.error(`❌ IA (${stats.name}):`, err?.message || err);
        break;
      }
    }
  }
  return local;
}

export async function getSocialOutcome(
  agentA: { id: number; name: string; society: string; hp: number; food: number; water: number },
  agentB: { id: number; name: string; society: string; hp: number; food: number; water: number },
  weather: string
): Promise<SocialOutcome> {
  if (!apiKey) return fallbackSocial(agentA, agentB);

  try {
    const response = await groq.chat.completions.create({
      model: TARGET_MODEL,
      messages: [
        {
          role: 'user',
          content: `Encontro (${weather}):
${agentA.name}: soc=${agentA.society} HP=${agentA.hp} comida=${agentA.food} água=${agentA.water}
${agentB.name}: soc=${agentB.society} HP=${agentB.hp} comida=${agentB.food} água=${agentB.water}
JSON: {"action":"ALIANÇA|CONFLITO|COMÉRCIO|DIÁLOGO|TROCA","message":"...","relationChange":-25..25}`,
        },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.75,
      max_tokens: 200,
    });
    const parsed = JSON.parse(response.choices[0]?.message?.content || '{}');
    const allowed = ['ALIANÇA', 'CONFLITO', 'COMÉRCIO', 'DIÁLOGO', 'TROCA'];
    const action = (allowed.includes(parsed.action) ? parsed.action : 'DIÁLOGO') as SocialOutcome['action'];
    let newSociety: string | undefined;
    if (action === 'ALIANÇA') {
      newSociety =
        agentA.society !== 'Nenhuma'
          ? agentA.society
          : agentB.society !== 'Nenhuma'
            ? agentB.society
            : `Facção de ${agentA.name}`;
    }
    return {
      action,
      message: parsed.message
        ? String(parsed.message).slice(0, 200)
        : `${agentA.name} e ${agentB.name} interagiram.`,
      relationChange: Math.max(-25, Math.min(25, Number(parsed.relationChange) || 0)),
      newSociety,
    };
  } catch {
    return fallbackSocial(agentA, agentB);
  }
}

function fallbackSocial(
  agentA: { name: string; society: string; hp: number; food: number; water: number },
  agentB: { name: string; society: string; hp: number; food: number; water: number }
): SocialOutcome {
  if (agentA.food < 20 && agentB.food > 40) {
    return {
      action: 'TROCA',
      message: `${agentB.name} compartilhou comida com ${agentA.name}.`,
      relationChange: 12,
      trade: { food: 10 },
    };
  }
  if (
    agentA.society !== 'Nenhuma' &&
    agentB.society !== 'Nenhuma' &&
    agentA.society !== agentB.society &&
    Math.random() < 0.4
  ) {
    return {
      action: 'CONFLITO',
      message: `Tensão entre ${agentA.society} e ${agentB.society}!`,
      relationChange: -20,
    };
  }
  if (
    agentA.society === 'Nenhuma' &&
    agentB.society === 'Nenhuma' &&
    agentA.hp > 50 &&
    agentB.hp > 50 &&
    Math.random() < 0.35
  ) {
    return {
      action: 'ALIANÇA',
      message: `${agentA.name} e ${agentB.name} fundaram uma facção!`,
      relationChange: 20,
      newSociety: `Facção de ${agentA.name}`,
    };
  }
  return {
    action: 'DIÁLOGO',
    message: `${agentA.name} e ${agentB.name} conversaram sobre a ilha.`,
    relationChange: 4,
  };
}
