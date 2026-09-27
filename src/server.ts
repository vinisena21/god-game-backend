import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import dotenv from 'dotenv';
import { db } from './db';
import { getSocialOutcome } from './ai';
import {
  canPerform,
  consume,
  getDivineState,
  mapBlessingToAction,
  resetDivinePower,
  syncTick,
  type DivineActionType,
} from './divine';

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*' },
});

io.on('connection', (socket) => {
  console.log('⚡ Cliente conectado:', socket.id);
  socket.on('disconnect', () => {
    console.log('Cliente desconectado:', socket.id);
  });
});

// Broadcast do estado a ~4 FPS (inclui poder divino)
setInterval(async () => {
  try {
    const [worldRes, agentsRes, structRes, entRes, eventsRes] = await Promise.all([
      db.query('SELECT current_tick, weather FROM world_state WHERE id = 1'),
      db.query(
        'SELECT id, name, current_action as action, hp, water, food, wood, iron, weapon, shield, x, y, society FROM agents WHERE hp > 0 ORDER BY id ASC'
      ),
      db.query('SELECT * FROM world_structures'),
      db.query('SELECT * FROM world_entities WHERE hp > 0'),
      db.query('SELECT * FROM world_events ORDER BY id DESC LIMIT 50'),
    ]);

    const world = worldRes.rows[0] || { current_tick: 0, weather: 'Desconhecido' };
    if (world.current_tick != null) syncTick(world.current_tick);

    io.emit('gameState', {
      world,
      agents: agentsRes.rows,
      structures: structRes.rows,
      entities: entRes.rows,
      events: eventsRes.rows,
      divine: getDivineState(),
    });
  } catch {
    // Ignora conflitos transitórios de leitura
  }
}, 250);

// ===================== ROTAS =====================

app.get('/api/world', async (_req, res) => {
  try {
    const worldRes = await db.query('SELECT * FROM world_state WHERE id = 1');
    res.json(worldRes.rows[0]);
  } catch {
    res.status(500).json({ error: 'Erro ao buscar o mundo' });
  }
});

app.get('/api/world/events', async (_req, res) => {
  try {
    const eventsRes = await db.query('SELECT * FROM world_events ORDER BY id DESC LIMIT 50');
    res.json(eventsRes.rows);
  } catch {
    res.status(500).json({ error: 'Erro ao buscar eventos' });
  }
});

app.get('/api/world/prayers', async (_req, res) => {
  try {
    const prayersRes = await db.query(
      "SELECT * FROM world_events WHERE type = 'ORAÇÃO' ORDER BY id DESC LIMIT 30"
    );
    res.json(prayersRes.rows);
  } catch {
    res.status(500).json({ error: 'Erro ao buscar orações' });
  }
});

/** Estado atual da energia/cooldowns divinos */
app.get('/api/world/divine', (_req, res) => {
  res.json(getDivineState());
});

app.get('/api/world/structures', async (_req, res) => {
  try {
    const structRes = await db.query('SELECT * FROM world_structures');
    res.json(structRes.rows);
  } catch {
    res.status(500).json({ error: 'Erro ao buscar estruturas' });
  }
});

app.get('/api/world/entities', async (_req, res) => {
  try {
    const entRes = await db.query('SELECT * FROM world_entities WHERE hp > 0');
    res.json(entRes.rows);
  } catch {
    res.status(500).json({ error: 'Erro ao buscar entidades' });
  }
});

app.get('/api/agents', async (_req, res) => {
  try {
    const agentsRes = await db.query(
      'SELECT id, name, current_action as action, hp, water, food, wood, iron, weapon, shield, x, y, society FROM agents ORDER BY id ASC'
    );
    res.json(agentsRes.rows);
  } catch {
    res.status(500).json({ error: 'Erro' });
  }
});

app.post('/api/world/weather', async (req, res) => {
  const { weather } = req.body;
  try {
    await db.query('UPDATE world_state SET weather = $1 WHERE id = 1', [weather]);
    const tickRes = await db.query('SELECT current_tick FROM world_state WHERE id = 1');
    await db.query('INSERT INTO world_events (tick, type, message) VALUES ($1, $2, $3)', [
      tickRes.rows[0].current_tick,
      'CLIMA',
      `O clima mudou para: ${weather}`,
    ]);
    res.json({ message: 'Clima alterado' });
  } catch {
    res.status(500).json({ error: 'Erro' });
  }
});

app.post('/api/world/reset', async (_req, res) => {
  try {
    await db.query("UPDATE world_state SET current_tick = 0, weather = 'Ensolarado' WHERE id = 1");
    await db.query('DELETE FROM world_events');
    await db.query('DELETE FROM agent_memories');
    await db.query('DELETE FROM world_structures');
    await db.query('DELETE FROM agent_relationships');
    await db.query("DELETE FROM agents WHERE name LIKE '%Jr.%'");

    await db.query('DELETE FROM world_entities');
    const entitiesToInsert: string[] = [];
    for (let i = 0; i < 8; i++)
      entitiesToInsert.push(`('Árvore Anciã', floor(random() * 40) + 5, floor(random() * 40) + 5, 100, 50)`);
    for (let i = 0; i < 4; i++)
      entitiesToInsert.push(`('Jazida de Ouro', floor(random() * 40) + 55, floor(random() * 40) + 5, 200, 100)`);
    for (let i = 0; i < 6; i++)
      entitiesToInsert.push(`('Cervo', floor(random() * 80) + 10, floor(random() * 80) + 10, 30, 40)`);
    for (let i = 0; i < 4; i++)
      entitiesToInsert.push(`('Lobo', floor(random() * 80) + 10, floor(random() * 80) + 10, 60, 0)`);

    await db.query(
      `INSERT INTO world_entities (type, x, y, hp, resource_amount) VALUES ${entitiesToInsert.join(',')}`
    );

    await db.query(`
      UPDATE agents SET hp = 100, water = 50, food = 50, wood = 0, iron = 0, weapon = 0, shield = 0,
      x = floor(random() * 80) + 10, y = floor(random() * 80) + 10, society = 'Nenhuma', current_action = 'Acordando'
    `);

    await db.query("INSERT INTO world_events (tick, type, message) VALUES (0, 'BIG BANG', 'Uma nova civilização se inicia.')");

    resetDivinePower();

    res.json({ message: 'Mundo resetado!' });
  } catch (error) {
    console.error('Erro no reset:', error);
    res.status(500).json({ error: 'Erro' });
  }
});

/**
 * Resposta divina a um agente
 * Body: { message?: string, blessing?: 'heal' | 'food' | 'water' | 'resources' | 'full' }
 */
app.post('/api/agents/:id/miracle', async (req, res) => {
  const agentId = Number(req.params.id);
  const { message, blessing } = req.body as {
    message?: string;
    blessing?: 'heal' | 'food' | 'water' | 'resources' | 'full';
  };

  if (!agentId || Number.isNaN(agentId)) {
    return res.status(400).json({ error: 'ID de agente inválido' });
  }

  try {
    const tickRes = await db.query('SELECT current_tick FROM world_state WHERE id = 1');
    const tick = tickRes.rows[0].current_tick;
    syncTick(tick);

    const action = mapBlessingToAction(blessing);
    const check = canPerform(action, agentId);
    if (!check.ok) {
      return res.status(429).json({
        error: check.error,
        cooldownRemaining: check.cooldownRemaining,
        cost: check.cost,
        divine: getDivineState(),
      });
    }

    const agentRes = await db.query('SELECT * FROM agents WHERE id = $1', [agentId]);
    const agent = agentRes.rows[0];
    if (!agent) {
      return res.status(404).json({ error: 'Agente não encontrado' });
    }

    // Consome poder divino
    consume(action, agentId);

    let effectDesc = '';
    if (blessing === 'heal' || blessing === 'full') {
      await db.query('UPDATE agents SET hp = LEAST(100, hp + 40) WHERE id = $1', [agentId]);
      effectDesc += '❤️ +40 HP ';
    }
    if (blessing === 'food' || blessing === 'full') {
      await db.query('UPDATE agents SET food = LEAST(100, food + 40) WHERE id = $1', [agentId]);
      effectDesc += '🍖 +40 comida ';
    }
    if (blessing === 'water' || blessing === 'full') {
      await db.query('UPDATE agents SET water = LEAST(100, water + 40) WHERE id = $1', [agentId]);
      effectDesc += '💧 +40 água ';
    }
    if (blessing === 'resources' || blessing === 'full') {
      await db.query('UPDATE agents SET wood = wood + 20, iron = iron + 10 WHERE id = $1', [agentId]);
      effectDesc += '🪵 +20 madeira ⛏️ +10 ferro ';
    }

    const divineMessage =
      message?.trim() ||
      (blessing
        ? `Receba minha bênção, ${agent.name}.`
        : `Eu ouvi sua oração, ${agent.name}.`);

    await db.query(
      'INSERT INTO agent_memories (agent_id, content, tick_created) VALUES ($1, $2, $3)',
      [agentId, `VOZ DIVINA: ${divineMessage}${effectDesc ? ` [${effectDesc.trim()}]` : ''}`, tick]
    );

    await db.query("INSERT INTO world_events (tick, type, message) VALUES ($1, 'RESPOSTA_DIVINA', $2)", [
      tick,
      `✨ O Criador respondeu a ${agent.name}: "${divineMessage}"${effectDesc ? ` — ${effectDesc.trim()}` : ''}`,
    ]);

    await db.query("UPDATE agents SET current_action = $1 WHERE id = $2", [
      'Sentindo a graça divina...',
      agentId,
    ]);

    res.json({
      success: true,
      message: 'Resposta divina enviada!',
      agent: agent.name,
      effects: effectDesc.trim() || null,
      cost: check.cost,
      divine: getDivineState(),
    });
  } catch (error) {
    console.error('Erro na resposta divina:', error);
    res.status(500).json({ error: 'Falha ao enviar milagre' });
  }
});

// Ação divina no mapa (Raio / Milagre de árvore)
app.post('/api/world/god-action', async (req, res) => {
  const { action, x, y } = req.body as { action: string; x: number; y: number };

  try {
    const tickRes = await db.query('SELECT current_tick FROM world_state WHERE id = 1');
    const tick = tickRes.rows[0].current_tick;
    syncTick(tick);

    const divineAction: DivineActionType | null =
      action === 'RAIO' ? 'RAIO' : action === 'MILAGRE' ? 'MILAGRE' : null;

    if (!divineAction) {
      return res.status(400).json({ error: 'Ação inválida' });
    }

    const check = canPerform(divineAction);
    if (!check.ok) {
      return res.status(429).json({
        error: check.error,
        cooldownRemaining: check.cooldownRemaining,
        cost: check.cost,
        divine: getDivineState(),
      });
    }

    consume(divineAction);

    if (divineAction === 'RAIO') {
      await db.query('UPDATE agents SET hp = 0 WHERE sqrt(power(x - $1, 2) + power(y - $2, 2)) < 5', [
        x,
        y,
      ]);
      await db.query('DELETE FROM world_structures WHERE sqrt(power(x - $1, 2) + power(y - $2, 2)) < 5', [
        x,
        y,
      ]);
      await db.query("INSERT INTO world_events (tick, type, message) VALUES ($1, 'PUNIÇÃO', $2)", [
        tick,
        `⚡ A Mão de Deus disparou um RAIO nas coordenadas [${x}, ${y}]!`,
      ]);
    } else {
      await db.query(
        "INSERT INTO world_entities (type, x, y, resource_amount) VALUES ('Árvore Anciã', $1, $2, 50)",
        [x, y]
      );
      await db.query("INSERT INTO world_events (tick, type, message) VALUES ($1, 'MILAGRE', $2)", [
        tick,
        `✨ Um milagre divino fez brotar uma Árvore em [${x}, ${y}]!`,
      ]);
    }

    res.json({ success: true, cost: check.cost, divine: getDivineState() });
  } catch (error) {
    console.error('Erro na intervenção divina:', error);
    res.status(500).json({ error: 'Falha divina' });
  }
});

// Cérebro social
app.post('/api/world/social-brain', async (req, res) => {
  const { agentA, agentB, tick } = req.body;

  try {
    const weatherRes = await db.query('SELECT weather FROM world_state WHERE id = 1');
    const weather = weatherRes.rows[0]?.weather || 'Ensolarado';

    const outcome = await getSocialOutcome(agentA, agentB, weather);

    await db.query(
      `INSERT INTO agent_relationships (agent_a_id, agent_b_id, relationship_score, last_interaction_tick)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (agent_a_id, agent_b_id) DO UPDATE
       SET relationship_score = agent_relationships.relationship_score + $3,
           last_interaction_tick = $4`,
      [agentA.id, agentB.id, outcome.relationChange, tick]
    );

    if (outcome.action === 'ALIANÇA' && outcome.newSociety) {
      await db.query('UPDATE agents SET society = $1 WHERE id IN ($2, $3)', [
        outcome.newSociety,
        agentA.id,
        agentB.id,
      ]);
    }

    if (outcome.action === 'CONFLITO') {
      await db.query('UPDATE agents SET hp = GREATEST(0, hp - 15) WHERE id IN ($1, $2)', [
        agentA.id,
        agentB.id,
      ]);
    }

    await db.query('INSERT INTO world_events (tick, type, message) VALUES ($1, $2, $3)', [
      tick,
      outcome.action,
      `📜 ${outcome.message} (${outcome.relationChange >= 0 ? '+' : ''}${outcome.relationChange} relação)`,
    ]);

    res.json({ success: true, summary: outcome.message, action: outcome.action });
  } catch (error) {
    console.error('Erro no Cérebro Social:', error);
    res.status(500).json({ error: 'Falha no diálogo' });
  }
});

const PORT = process.env.PORT || 3333;

server.listen(PORT, () => console.log(`🔥 Servidor + WebSocket na porta ${PORT}`));

import './loop';
