import OpenAI from 'openai';
import dotenv from 'dotenv';

dotenv.config();

const apiKey = process.env.GROQ_API_KEY;
if (!apiKey) {
  console.warn('⚠️ GROQ_API_KEY ausente no .env — IA usará fallback aleatório.');
}

const groq = new OpenAI({
  apiKey: apiKey || 'dummy',
  baseURL: 'https://api.groq.com/openai/v1',
});

// Modelo rápido e barato da Groq
const TARGET_MODEL = 'llama-3.3-70b-versatile';

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export interface AgentDecision {
  acao: string;
  memoria: string | null;
  oracao: string | null;
}

export interface SocialOutcome {
  action: 'ALIANÇA' | 'CONFLITO' | 'COMÉRCIO' | 'DIÁLOGO';
  message: string;
  relationChange: number;
  newSociety?: string;
}

/** Decisão individual de um agente (personalidade + clima + eventos recentes) */
export async function getAgentDecision(
  agentName: string,
  personality: string,
  weather: string,
  worldEvents: string
): Promise<AgentDecision> {
  if (!apiKey) {
    return fallbackDecision(agentName, weather);
  }

  const fullPrompt = `
Você é um habitante autônomo de uma ilha em um simulador de sobrevivência e diplomacia.
Nome: ${agentName}
Personalidade: ${personality || 'Pragmático e cauteloso'}

CLIMA ATUAL: ${weather}

EVENTOS RECENTES NO MUNDO:
${worldEvents || 'Nada de especial aconteceu recentemente.'}

REGRAS:
1. Decida a próxima ação com base na personalidade, no clima e nos eventos.
2. Pode explorar, caçar, coletar, construir, buscar aliança, atacar, etc.
3. Se for interagir com alguém, cite o nome.

Responda EXCLUSIVAMENTE em JSON válido:
{
  "acao": "Descrição curta da ação agora",
  "memoria": "Reflexão curta sobre a situação",
  "oracao": "Mensagem pedindo ajuda ao Criador, ou null"
}
`;

  let tentativas = 2;

  while (tentativas > 0) {
    try {
      const response = await groq.chat.completions.create({
        model: TARGET_MODEL,
        messages: [{ role: 'user', content: fullPrompt }],
        response_format: { type: 'json_object' },
        temperature: 0.75,
        max_tokens: 300,
      });

      const text = response.choices[0]?.message?.content || '{}';
      const parsed = JSON.parse(text);

      return {
        acao: parsed.acao ? String(parsed.acao).slice(0, 180) : `Explorando sob ${weather}.`,
        memoria: parsed.memoria ? String(parsed.memoria).slice(0, 180) : null,
        oracao: parsed.oracao && parsed.oracao !== 'null' ? String(parsed.oracao).slice(0, 140) : null,
      };
    } catch (err: any) {
      if (err?.status === 429 || String(err).includes('429')) {
        tentativas--;
        if (tentativas > 0) await sleep(8000);
      } else {
        console.error(`❌ Erro na IA (${agentName}):`, err?.message || err);
        break;
      }
    }
  }

  return fallbackDecision(agentName, weather);
}

/** Encontro social entre dois agentes — retorna o desfecho */
export async function getSocialOutcome(
  agentA: { id: number; name: string; society: string; hp: number; food: number; water: number },
  agentB: { id: number; name: string; society: string; hp: number; food: number; water: number },
  weather: string
): Promise<SocialOutcome> {
  if (!apiKey) {
    return fallbackSocial(agentA, agentB);
  }

  const prompt = `
Dois habitantes se encontraram cara a cara numa ilha.

${agentA.name}: sociedade="${agentA.society}", HP=${agentA.hp}, comida=${agentA.food}, água=${agentA.water}
${agentB.name}: sociedade="${agentB.society}", HP=${agentB.hp}, comida=${agentB.food}, água=${agentB.water}
Clima: ${weather}

Decida o desfecho do encontro. Escolha UMA ação:
- ALIANÇA (formam ou reforçam facção)
- CONFLITO (briga / roubo)
- COMÉRCIO (troca de recursos/info)
- DIÁLOGO (conversa amigável)

Responda EXCLUSIVAMENTE em JSON:
{
  "action": "ALIANÇA" | "CONFLITO" | "COMÉRCIO" | "DIÁLOGO",
  "message": "Frase narrativa curta descrevendo o que aconteceu",
  "relationChange": número entre -25 e +25
}
`;

  try {
    const response = await groq.chat.completions.create({
      model: TARGET_MODEL,
      messages: [{ role: 'user', content: prompt }],
      response_format: { type: 'json_object' },
      temperature: 0.8,
      max_tokens: 200,
    });

    const text = response.choices[0]?.message?.content || '{}';
    const parsed = JSON.parse(text);

    const action = (['ALIANÇA', 'CONFLITO', 'COMÉRCIO', 'DIÁLOGO'].includes(parsed.action)
      ? parsed.action
      : 'DIÁLOGO') as SocialOutcome['action'];

    let relationChange = Number(parsed.relationChange) || 0;
    relationChange = Math.max(-25, Math.min(25, relationChange));

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
      relationChange,
      newSociety,
    };
  } catch (err: any) {
    console.error('❌ Erro no cérebro social:', err?.message || err);
    return fallbackSocial(agentA, agentB);
  }
}

function fallbackDecision(name: string, weather: string): AgentDecision {
  return {
    acao: `Tentar sobreviver e observar os arredores sob ${weather}.`,
    memoria: 'A mente está confusa. Preciso focar na sobrevivência.',
    oracao: 'Criador, proteja-nos dos perigos desta ilha.',
  };
}

function fallbackSocial(
  agentA: { name: string; society: string },
  agentB: { name: string }
): SocialOutcome {
  const actions: SocialOutcome['action'][] = ['ALIANÇA', 'CONFLITO', 'COMÉRCIO', 'DIÁLOGO'];
  const action = actions[Math.floor(Math.random() * actions.length)];

  const map: Record<string, { message: string; relationChange: number; newSociety?: string }> = {
    ALIANÇA: {
      message: `${agentA.name} propôs uma aliança. ${agentB.name} aceitou!`,
      relationChange: 18,
      newSociety: agentA.society === 'Nenhuma' ? `Facção de ${agentA.name}` : agentA.society,
    },
    CONFLITO: {
      message: `${agentA.name} tentou tomar recursos de ${agentB.name}. Uma briga começou!`,
      relationChange: -18,
    },
    COMÉRCIO: {
      message: `${agentA.name} e ${agentB.name} trocaram informações sobre a ilha.`,
      relationChange: 8,
    },
    DIÁLOGO: {
      message: `${agentA.name} e ${agentB.name} conversaram amigavelmente.`,
      relationChange: 3,
    },
  };

  return { action, ...map[action] };
}
