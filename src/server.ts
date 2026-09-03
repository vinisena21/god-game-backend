import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import dotenv from 'dotenv';
import { db } from './db';

dotenv.config();

const app = express();
app.use(cors()); 
app.use(express.json());

// ⚡ 1. Acoplando o Socket.io ao servidor Express
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*' }
});

io.on('connection', (socket) => {
  console.log('⚡ Novo Diretor de Arte conectado no Socket! ID:', socket.id);
});

// ⚡ 2. O CORAÇÃO DO TEMPO REAL (Transmissão a 4 FPS)
setInterval(async () => {
  try {
    const worldRes = await db.query('SELECT current_tick, weather FROM world_state WHERE id = 1');
    const agentsRes = await db.query('SELECT id, name, current_action as action, hp, water, food, wood, iron, weapon, shield, x, y, society FROM agents WHERE hp > 0 ORDER BY id ASC');
    const structRes = await db.query('SELECT * FROM world_structures');
    const entRes = await db.query('SELECT * FROM world_entities WHERE hp > 0');
    const eventsRes = await db.query('SELECT * FROM world_events ORDER BY id DESC LIMIT 50');

    io.emit('gameState', {
      world: worldRes.rows[0],
      agents: agentsRes.rows,
      structures: structRes.rows,
      entities: entRes.rows,
      events: eventsRes.rows
    });
  } catch (error) {
    // Ignora pequenos conflitos de leitura simultânea para não travar o loop
  }
}, 250); 

// ==========================================
// 🛣️ ROTAS DA API HTTP (Intactas)
// ==========================================

app.get('/api/world', async (req, res) => {
  try {
    const worldRes = await db.query('SELECT * FROM world_state WHERE id = 1');
    res.json(worldRes.rows[0]);
  } catch (error) { res.status(500).json({ error: 'Erro ao buscar o mundo' }); }
});

app.get('/api/world/events', async (req, res) => {
  try {
    const eventsRes = await db.query('SELECT * FROM world_events ORDER BY id DESC LIMIT 50');
    res.json(eventsRes.rows);
  } catch (error) { res.status(500).json({ error: 'Erro ao buscar eventos' }); }
});

app.get('/api/world/structures', async (req, res) => {
  try {
    const structRes = await db.query('SELECT * FROM world_structures');
    res.json(structRes.rows);
  } catch (error) { res.status(500).json({ error: 'Erro ao buscar estruturas' }); }
});

app.get('/api/world/entities', async (req, res) => {
  try {
    const entRes = await db.query('SELECT * FROM world_entities WHERE hp > 0');
    res.json(entRes.rows);
  } catch (error) { res.status(500).json({ error: 'Erro ao buscar entidades' }); }
});

app.post('/api/world/weather', async (req, res) => {
  const { weather } = req.body;
  try {
    await db.query('UPDATE world_state SET weather = $1 WHERE id = 1', [weather]);
    const tickRes = await db.query('SELECT current_tick FROM world_state WHERE id = 1');
    await db.query('INSERT INTO world_events (tick, type, message) VALUES ($1, $2, $3)', [tickRes.rows[0].current_tick, 'CLIMA', `O clima mudou para: ${weather}`]);
    res.json({ message: 'Clima alterado' });
  } catch (error) { res.status(500).json({ error: 'Erro' }); }
});

app.post('/api/world/reset', async (req, res) => {
  try {
    await db.query("UPDATE world_state SET current_tick = 0, weather = 'Ensolarado' WHERE id = 1");
    await db.query('DELETE FROM world_events');
    await db.query('DELETE FROM agent_memories');
    await db.query('DELETE FROM world_structures');
    await db.query('DELETE FROM agent_relationships'); 
    await db.query("DELETE FROM agents WHERE name LIKE '%Jr.%'"); 
    
    await db.query('DELETE FROM world_entities');
    const entitiesToInsert = [];
    for(let i=0; i<8; i++) entitiesToInsert.push(`('Árvore Anciã', floor(random() * 40) + 5, floor(random() * 40) + 5, 100, 50)`);
    for(let i=0; i<4; i++) entitiesToInsert.push(`('Jazida de Ouro', floor(random() * 40) + 55, floor(random() * 40) + 5, 200, 100)`);
    for(let i=0; i<6; i++) entitiesToInsert.push(`('Cervo', floor(random() * 80) + 10, floor(random() * 80) + 10, 30, 40)`);
    for(let i=0; i<4; i++) entitiesToInsert.push(`('Lobo', floor(random() * 80) + 10, floor(random() * 80) + 10, 60, 0)`);
    await db.query(`INSERT INTO world_entities (type, x, y, hp, resource_amount) VALUES ${entitiesToInsert.join(',')}`);

    await db.query(`
      UPDATE agents SET hp = 100, water = 50, food = 50, wood = 0, iron = 0, weapon = 0, shield = 0, 
      x = floor(random() * 80) + 10, y = floor(random() * 80) + 10, society = 'Nenhuma', current_action = 'Acordando'
    `);
    
    await db.query("INSERT INTO world_events (tick, type, message) VALUES (0, 'BIG BANG', 'Uma nova civilização se inicia.')");
    res.json({ message: 'Mundo resetado!' });
  } catch (error) { res.status(500).json({ error: 'Erro' }); }
});

app.post('/api/agents/:id/miracle', async (req, res) => {
  const agentId = req.params.id;
  const { message } = req.body;
  try {
    const worldRes = await db.query('SELECT current_tick FROM world_state WHERE id = 1');
    await db.query('INSERT INTO agent_memories (agent_id, content, tick_created) VALUES ($1, $2, $3)', [agentId, `VOZ DIVINA: ${message}`, worldRes.rows[0].current_tick]);
    res.json({ message: 'Milagre enviado!' });
  } catch (error) { res.status(500).json({ error: 'Erro' }); }
});

app.get('/api/agents', async (req, res) => {
  try {
    const agentsRes = await db.query('SELECT id, name, current_action as action, hp, water, food, wood, iron, weapon, shield, x, y, society FROM agents ORDER BY id ASC');
    res.json(agentsRes.rows);
  } catch (error) { res.status(500).json({ error: 'Erro' }); }
});

// ⚡ A Rota da Mão de Deus
app.post('/api/world/god-action', async (req, res) => {
  const { action, x, y } = req.body;
  try {
    const tickRes = await db.query('SELECT current_tick FROM world_state WHERE id = 1');
    const tick = tickRes.rows[0].current_tick;

    if (action === 'RAIO') {
       await db.query('UPDATE agents SET hp = 0 WHERE sqrt(power(x - $1, 2) + power(y - $2, 2)) < 5', [x, y]);
       await db.query('DELETE FROM world_structures WHERE sqrt(power(x - $1, 2) + power(y - $2, 2)) < 5', [x, y]);
       await db.query("INSERT INTO world_events (tick, type, message) VALUES ($1, 'PUNIÇÃO', $2)", [tick, `⚡ A Mão de Deus disparou um RAIO nas coordenadas [${x}, ${y}]!`]);
    } 
    else if (action === 'MILAGRE') {
       await db.query("INSERT INTO world_entities (type, x, y, resource_amount) VALUES ('Árvore Anciã', $1, $2, 50)", [x, y]);
       await db.query("INSERT INTO world_events (tick, type, message) VALUES ($1, 'MILAGRE', $2)", [tick, `✨ Um milagre divino fez brotar uma Árvore em [${x}, ${y}]!`]);
    }
    res.json({ success: true });
  } catch (error) {
    console.error('Erro na intervenção divina:', error);
    res.status(500).json({ error: 'Falha divina' });
  }
});

// 🧠 NOVO: ROTA DO CÉREBRO SOCIAL (SIMULAÇÃO DE LLM)
app.post('/api/world/social-brain', async (req, res) => {
  const { agentA, agentB, tick } = req.body;

  try {
    // Sorteio inteligente para simular a resposta da LLM
    const actions = ['ALIANÇA', 'CONFLITO', 'COMÉRCIO', 'DIÁLOGO'];
    const randomAction = actions[Math.floor(Math.random() * actions.length)];
    
    let message = '';
    let relationChange = 0;
    let newSociety = agentA.society;

    if (randomAction === 'ALIANÇA') {
      message = `${agentA.name} propôs uma aliança tática. ${agentB.name} aceitou!`;
      relationChange = 20;
      // Cria o nome da facção se ele não tiver uma
      newSociety = agentA.society === 'Nenhuma' ? `Facção de ${agentA.name}` : agentA.society;
    } else if (randomAction === 'CONFLITO') {
      message = `${agentA.name} tentou roubar recursos de ${agentB.name}. Uma briga começou!`;
      relationChange = -20;
    } else if (randomAction === 'COMÉRCIO') {
      message = `${agentA.name} e ${agentB.name} trocaram segredos sobre a ilha.`;
      relationChange = 10;
    } else {
      message = `${agentA.name} e ${agentB.name} apenas se encararam de longe.`;
      relationChange = 2;
    }

    // 1. Atualiza a tabela de relacionamentos
    await db.query(
      `INSERT INTO agent_relationships (agent_a_id, agent_b_id, relationship_score, last_interaction_tick) 
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (agent_a_id, agent_b_id) DO UPDATE SET relationship_score = agent_relationships.relationship_score + $3, last_interaction_tick = $4`,
      [agentA.id, agentB.id, relationChange, tick]
    );

    // 2. Se formaram aliança, atualiza a sociedade de ambos no banco
    if (randomAction === 'ALIANÇA') {
      await db.query('UPDATE agents SET society = $1 WHERE id IN ($2, $3)', [newSociety, agentA.id, agentB.id]);
    }

    // 3. Registra o desfecho no Livro das Eras
    await db.query(
      "INSERT INTO world_events (tick, type, message) VALUES ($1, $2, $3)",
      [tick, randomAction, `📜 Desfecho Social: ${message} (+${relationChange} de Relação)`]
    );

    res.json({ success: true, summary: message });
  } catch (error) {
    console.error('Erro no Cérebro Social:', error);
    res.status(500).json({ error: 'Falha no diálogo' });
  }
});

// ==========================================
// 🚀 INICIALIZAÇÃO DO SERVIDOR
// ==========================================
const PORT = process.env.PORT || 3333;

server.listen(PORT, () => console.log(`🔥 Servidor c/ WebSocket bombando na porta ${PORT}`));

import './loop';