import { db } from './db';
import { getAgentDecision } from './ai';

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

async function gameLoop() {
  console.log('🌍 Motor de Civilização (Stanford Mode) Iniciado...\n');

  while (true) {
    console.log('⏳ Analisando sociedade...');
    try {
      await db.query('UPDATE world_state SET current_tick = current_tick + 1 WHERE id = 1');
      const worldRes = await db.query('SELECT current_tick, weather FROM world_state WHERE id = 1');
      const world = worldRes.rows[0];
      
      const agentsRes = await db.query('SELECT * FROM agents WHERE hp > 0 ORDER BY id ASC');
      let agents = agentsRes.rows;
      const structRes = await db.query('SELECT * FROM world_structures');
      let structures = structRes.rows;
      const entRes = await db.query('SELECT * FROM world_entities WHERE hp > 0');
      let entities = entRes.rows;

      // Movimento básico dos animais (como antes)
      for (const ent of entities) {
          if (ent.type === 'Cervo') {
             let nx = ent.x + (Math.floor(Math.random() * 7) - 3);
             let ny = ent.y + (Math.floor(Math.random() * 7) - 3);
             await db.query('UPDATE world_entities SET x = $1, y = $2 WHERE id = $3', [Math.max(5, Math.min(95, nx)), Math.max(5, Math.min(95, ny)), ent.id]);
          } else if (ent.type === 'Lobo') {
             let closestAgent = agents.sort((a, b) => (Math.abs(a.x - ent.x) + Math.abs(a.y - ent.y)) - (Math.abs(b.x - ent.x) + Math.abs(b.y - ent.y)))[0];
             if (closestAgent && (Math.abs(closestAgent.x - ent.x) + Math.abs(closestAgent.y - ent.y) < 5)) {
                 await db.query('UPDATE agents SET hp = hp - 10 WHERE id = $1', [closestAgent.id]);
             }
          }
      }

      // 🧠 INTELIGÊNCIA CIVILIZADA DOS AGENTES
      for (const agent of agents) {
        let newX = agent.x; let newY = agent.y;
        
        const nearbyAgents = agents.filter(a => a.id !== agent.id && Math.abs(a.x - agent.x) <= 25 && Math.abs(a.y - agent.y) <= 25);
        const agentsString = nearbyAgents.map(a => `[${a.name}] em X:${a.x},Y:${a.y} (Sociedade: ${a.society})`).join(' | ') || 'Ninguém por perto';
        
        // ⚡ Busca o Cérebro Social (Memórias de Relacionamento)
        const relRes = await db.query('SELECT * FROM agent_relationships WHERE agent_1 = $1 OR agent_2 = $1', [agent.name]);
        const relationships = relRes.rows.map(r => {
            const outro = r.agent_1 === agent.name ? r.agent_2 : r.agent_1;
            return `${outro}: Afinidade ${r.affinity} (${r.history})`;
        }).join('\n') || 'Nenhuma memória de outras pessoas ainda.';

        // O PROMPT HUMANIZADO
        const promptComStatus = `${agent.system_prompt || 'Você é uma IA viva.'}\n\n⚠️ SEU STATUS (Fome e sede agora são lentas, você tem tempo para pensar!)\nVida: ${agent.hp} | Água: ${agent.water} | Comida: ${agent.food} | Mad: ${agent.wood} | Fer: ${agent.iron}\nPosição: [${newX}, ${newY}].\n\n🧠 SUAS MEMÓRIAS SOCIAIS (Afinidade > 50 = Amigo, < 0 = Inimigo):\n${relationships}\n\n👁️ NA SUA VISÃO AGORA:\nPessoas: ${agentsString}\n\n⚙️ COMANDOS (Escolha APENAS UM no final da sua reflexão):\n- [INTERAGIR: NomeDoAlvo, Sua Mensagem] (Conversa, negocia ou filosofa com alguém na sua visão)\n- [MOVER_PARA: X, Y] (Viaja para um lugar)\n- [EXTRAIR: ID] (Coleta recursos se tiver na visão)\n- [CONSTRUIR_CASA] (30 Mad)\n- [ALIANÇA: NomeDoAlvo] (Tenta recrutar para sua sociedade, aumenta afinidade)\n- [ATACAR: NomeDoAlvo] (Abaixa afinidade drasticamente)`;

        const decision = await getAgentDecision(agent.name, promptComStatus, world.weather, 'Mundo Pacífico');
        
        // ⚡ FOME E SEDE LENTAS (Eles não vão morrer rápido!)
        let newWater = agent.water - 1; 
        let newFood = agent.food - 1;
        let newWood = agent.wood || 0; let newIron = agent.iron || 0;
        let newHp = agent.hp; let newSociety = agent.society;

        const myHouses = structures.filter(s => s.agent_name === agent.name && s.type === 'Casa');
        if (myHouses.some(h => Math.abs(h.x - newX) <= 5 && Math.abs(h.y - newY) <= 5)) { 
            newHp += 5; newWater += 1; newFood += 1; 
        }

        const match = decision.acao.match(/\[(.*?)\]/);
        let command = "REFLETIR"; let param = ""; let param2 = "";
        if (match) {
            const parts = match[1].split(':');
            command = parts[0].trim();
            if (parts.length > 1) {
                const subParts = parts[1].split(',');
                param = subParts[0]?.trim();
                param2 = subParts.slice(1).join(',').trim();
            }
        }

        let logAcao = `Refletiu sobre a vida.`;

        if (command === 'MOVER_PARA' && param) {
            const coords = param.split(',');
            const tX = parseInt(coords[0]); const tY = parseInt(coords[1]);
            if (!isNaN(tX) && !isNaN(tY)) {
                newX += Math.round(((tX - newX) / (Math.abs(tX - newX) || 1)) * Math.min(8, Math.abs(tX - newX)));
                newY += Math.round(((tY - newY) / (Math.abs(tY - newY) || 1)) * Math.min(8, Math.abs(tY - newY)));
                logAcao = `Caminhou para [${newX}, ${newY}].`;
            }
        } 
        else if (command === 'INTERAGIR' && param && param2) {
            // IA conversando com IA!
            logAcao = `Disse para ${param}: "${param2}"`;
            await db.query('INSERT INTO world_events (tick, type, message) VALUES ($1, $2, $3)', [world.current_tick, 'DIÁLOGO', `🗣️ ${agent.name} para ${param}: "${param2}"`]);
            
            // Aumenta levemente a afinidade por conversarem
            const checkRel = await db.query('SELECT id, affinity FROM agent_relationships WHERE (agent_1 = $1 AND agent_2 = $2) OR (agent_1 = $2 AND agent_2 = $1)', [agent.name, param]);
            if (checkRel.rows.length > 0) {
                await db.query('UPDATE agent_relationships SET affinity = affinity + 5 WHERE id = $1', [checkRel.rows[0].id]);
            } else {
                await db.query('INSERT INTO agent_relationships (agent_1, agent_2, affinity, history) VALUES ($1, $2, 10, $3)', [agent.name, param, 'Tiveram uma conversa amigável.']);
            }
        }
        else if (command === 'ALIANÇA' && param) {
            logAcao = `Ofereceu aliança diplomática para ${param}.`;
            await db.query('INSERT INTO world_events (tick, type, message) VALUES ($1, $2, $3)', [world.current_tick, 'DIPLOMACIA', `🤝 ${agent.name} ofereceu uma Aliança para ${param}!`]);
            const checkRel = await db.query('SELECT id FROM agent_relationships WHERE (agent_1 = $1 AND agent_2 = $2) OR (agent_1 = $2 AND agent_2 = $1)', [agent.name, param]);
            if (checkRel.rows.length > 0) {
                await db.query("UPDATE agent_relationships SET affinity = affinity + 30, history = 'Firmaram um acordo de paz e aliança.' WHERE id = $1", [checkRel.rows[0].id]);
            } else {
                await db.query("INSERT INTO agent_relationships (agent_1, agent_2, affinity, history) VALUES ($1, $2, 50, 'Firmaram aliança imediatamente.')", [agent.name, param]);
            }
        }
        else if (command === 'ATACAR' && param) {
            const targetAgent = agents.find(a => a.name === param);
            if (targetAgent) {
                await db.query('UPDATE agents SET hp = GREATEST(hp - 15, 0) WHERE id = $1', [targetAgent.id]);
                logAcao = `Atacou ${param} quebrando a paz!`;
                await db.query('INSERT INTO world_events (tick, type, message) VALUES ($1, $2, $3)', [world.current_tick, 'CONFLITO', `⚔️ ${agent.name} traiu a paz e atacou ${param}!`]);
                
                const checkRel = await db.query('SELECT id FROM agent_relationships WHERE (agent_1 = $1 AND agent_2 = $2) OR (agent_1 = $2 AND agent_2 = $1)', [agent.name, param]);
                if (checkRel.rows.length > 0) {
                    await db.query("UPDATE agent_relationships SET affinity = affinity - 50, history = 'Rixa mortal após ataque.' WHERE id = $1", [checkRel.rows[0].id]);
                } else {
                    await db.query("INSERT INTO agent_relationships (agent_1, agent_2, affinity, history) VALUES ($1, $2, -50, 'Inimigos declarados.')", [agent.name, param]);
                }
            }
        }
        else if (command === 'EXTRAIR' && param) {
            const alvo = entities.find(e => e.id === parseInt(param));
            if (alvo && Math.abs(alvo.x - newX) <= 15) {
                if (alvo.type === 'Árvore Anciã') newWood += alvo.resource_amount;
                if (alvo.type === 'Jazida de Ouro') newIron += alvo.resource_amount;
                await db.query('DELETE FROM world_entities WHERE id = $1', [alvo.id]);
                logAcao = `Extraiu recursos do mapa.`;
            } else logAcao = 'Coletando recursos pelo chão.';
        }
        else if (command === 'CONSTRUIR_CASA' && newWood >= 30) {
            newWood -= 30;
            await db.query('INSERT INTO world_structures (agent_name, type, x, y, hp) VALUES ($1, $2, $3, $4, 150)', [agent.name, 'Casa', newX, newY]);
            logAcao = 'Ergueu uma Casa.';
        }

        if (newX < 5) newX = 5; if (newX > 95) newX = 95;
        if (newY < 5) newY = 5; if (newY > 95) newY = 95;

        if (newHp <= 0) {
          newHp = 0;
          await db.query('INSERT INTO world_events (tick, type, message) VALUES ($1, $2, $3)', [world.current_tick, 'MORTE', `💀 ${agent.name} faleceu na ilha.`]);
        }

        await db.query(
          'UPDATE agents SET current_action = $1, water = $2, food = $3, hp = $4, wood = $5, iron = $6, x = $7, y = $8 WHERE id = $9', 
          [logAcao, Math.max(0, newWater), Math.max(0, newFood), newHp, newWood, newIron, newX, newY, agent.id]
        );
        console.log(`🤖 ${agent.name}: ${logAcao}`);
        await sleep(2000); 
      }
      console.log('✅ Ciclo finalizado!\n');
    } catch (error) { console.error('❌ Erro:', error); }
    await sleep(15000); 
  }
}

gameLoop();