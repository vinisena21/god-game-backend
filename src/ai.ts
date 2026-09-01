import OpenAI from 'openai';
import dotenv from 'dotenv';

dotenv.config();

const apiKey = process.env.GROQ_API_KEY;
if (!apiKey) console.error("❌ ERRO: GROQ_API_KEY ausente no arquivo .env.");

const groq = new OpenAI({
  apiKey: apiKey || '',
  baseURL: "https://api.groq.com/openai/v1",
});

const TARGET_MODEL = 'openai/gpt-oss-20b';

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// NOVO PARÂMETRO: worldEvents
export async function getAgentDecision(agentName: string, promptText: string, weather: string, worldEvents: string) {
  const fullPrompt = `
  Você é o líder autônomo de uma facção em um jogo de simulação de sobrevivência e diplomacia.
  Nome: ${agentName}
  Sua Personalidade: ${promptText}
  
  🌍 CLIMA ATUAL: ${weather}
  
  📢 RELATÓRIO DE INTELIGÊNCIA (O que as outras facções estão fazendo agora):
  ${worldEvents}

  REGRAS DE AÇÃO:
  1. Baseado na sua personalidade, no clima e nas ações dos outros, decida seu próximo passo.
  2. Você pode ignorá-los, oferecer alianças, roubá-los, sabotá-los ou declarar guerra.
  3. Se for interagir, cite o nome do líder alvo na sua ação.

  Responda EXCLUSIVAMENTE em JSON com o formato exato abaixo. Não adicione nenhum texto antes ou depois.
  {
    "acao": "Descreva sua ação AGORA. Seja estratégico.",
    "memoria": "Uma reflexão curta sobre a situação política ou climática.",
    "oracao": "Uma mensagem direta pedindo ajuda ao Criador, ou null"
  }
  `;

  let tentativas = 3;

  while (tentativas > 0) {
    try {
      const response = await groq.chat.completions.create({
        model: TARGET_MODEL,
        messages: [{ role: "user", content: fullPrompt }],
        response_format: { type: "json_object" }, 
        temperature: 0.8, // Aumentei um pouco a temperatura para gerar mais criatividade nos conflitos
      });

      const responseText = response.choices[0]?.message?.content || '{}';
      const parsed = JSON.parse(responseText);
      
      return {
        acao: parsed.acao ? String(parsed.acao).slice(0, 200) : null,
        memoria: parsed.memoria ? String(parsed.memoria).slice(0, 200) : null,
        oracao: parsed.oracao ? String(parsed.oracao).slice(0, 150) : null,
      };
    } catch (err: any) {
      if (err?.status === 429 || String(err).includes('429')) {
        tentativas--;
        if (tentativas > 0) {
          console.warn(`⏳ Limite para ${agentName}. Tentando de novo em 10s...`);
          await sleep(10000); 
        }
      } else {
        console.error(`❌ Erro fatal na IA:`, err?.message || err);
        throw err; 
      }
    }
  }

  return {
    acao: `Tentar sobreviver e observar os inimigos durante a condição de ${weather}.`,
    memoria: `Minha mente está confusa. Preciso focar na sobrevivência antes da diplomacia.`,
    oracao: `Deus, nossas forças acabaram. Proteja-nos dos nossos inimigos.`
  };
}