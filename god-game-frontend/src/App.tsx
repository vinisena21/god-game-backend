import { useState, useEffect } from 'react';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3333';

export default function App() {
  const [worldState, setWorldState] = useState({ current_tick: 0, weather: 'Carregando...' });
  const [agents, setAgents] = useState<any[]>([]);
  const [structures, setStructures] = useState<any[]>([]);
  const [events, setEvents] = useState<any[]>([]);
  const [isChanging, setIsChanging] = useState(false);
  const [miracleText, setMiracleText] = useState<{ [key: number]: string }>({});

  const fetchData = async () => {
    try {
      const worldRes = await fetch(`${API_URL}/api/world`);
      if (worldRes.ok) setWorldState(await worldRes.json());
      const agentsRes = await fetch(`${API_URL}/api/agents`);
      if (agentsRes.ok) setAgents(await agentsRes.json());
      const structRes = await fetch(`${API_URL}/api/world/structures`);
      if (structRes.ok) setStructures(await structRes.json());
      const eventsRes = await fetch(`${API_URL}/api/world/events`);
      if (eventsRes.ok) setEvents(await eventsRes.json());
    } catch (error) {}
  };

  const changeWeather = async (newWeather: string) => {
    setIsChanging(true);
    setWorldState(prev => ({ ...prev, weather: `⏳ Invocando ${newWeather}...` }));
    try {
      await fetch(`${API_URL}/api/world/weather`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ weather: newWeather }) });
      fetchData();
    } finally { setIsChanging(false); }
  };

  const resetWorld = async () => {
    if (!window.confirm("⚠️ ALERTA DO CRIADOR: Iniciar o BIG BANG? Isso destrói o mapa inteiro e mata os filhos.")) return;
    setIsChanging(true);
    try {
      await fetch(`${API_URL}/api/world/reset`, { method: 'POST' });
      fetchData();
    } finally { setIsChanging(false); }
  };

  const sendMiracle = async (agentId: number, name: string) => {
    const text = miracleText[agentId];
    if (!text) return;
    try {
      const response = await fetch(`${API_URL}/api/agents/${agentId}/miracle`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message: text }) });
      if (response.ok) {
        alert(`⚡ A Voz Divina interviu na mente de ${name}!`);
        setMiracleText(prev => ({ ...prev, [agentId]: '' }));
        fetchData();
      }
    } catch (error) {}
  };

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 4000);
    return () => clearInterval(interval);
  }, []);

  const btnStyle = { padding: '0.6rem 1.2rem', cursor: isChanging ? 'wait' : 'pointer', backgroundColor: '#333', color: '#fff', border: '1px solid #555', borderRadius: '4px', fontWeight: 'bold' };

  return (
    <div style={{ padding: '2rem', fontFamily: 'system-ui, sans-serif', backgroundColor: '#050505', color: '#e5e5e5', minHeight: '100vh' }}>
      
      {/* 🗺️ O SUPER TERRÁRIO VIVO (Agora domina o topo) */}
      <section style={{ backgroundColor: '#111', padding: '1rem', borderRadius: '12px', border: '2px solid #333', marginBottom: '2rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <h1 style={{ margin: 0, color: '#fff' }}>👁️ O Terrário - <span style={{color: '#4ade80'}}>Tick {worldState.current_tick}</span> | Clima: {worldState.weather}</h1>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
             <button disabled={isChanging} onClick={() => changeWeather('Ensolarado')} style={btnStyle}>☀️ Sol</button>
             <button disabled={isChanging} onClick={() => changeWeather('Chuva Torrencial')} style={btnStyle}>🌧️ Chuva</button>
             <button disabled={isChanging} onClick={() => changeWeather('Clima Instável')} style={{ ...btnStyle, backgroundColor: '#4c1d95', borderColor: '#7c3aed' }}>🌪️ Instável</button>
             <button disabled={isChanging} onClick={resetWorld} style={{ ...btnStyle, backgroundColor: '#7f1d1d', borderColor: '#ef4444' }}>☄️ BIG BANG</button>
          </div>
        </div>

        <div style={{
          position: 'relative', width: '100%', height: '500px', 
          borderRadius: '12px', border: '4px solid #1e293b', overflow: 'hidden',
          boxShadow: '0 0 20px rgba(0,0,0,0.8) inset'
        }}>
          {/* Biomas */}
          <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, display: 'grid', gridTemplateColumns: '50% 50%', gridTemplateRows: '50% 50%', opacity: 0.85 }}>
             <div style={{ backgroundColor: '#14532d', borderRight: '2px solid #222', borderBottom: '2px solid #222', padding: '15px', color: '#fff', fontSize: '1rem', fontWeight: 'bold' }}>🌳 Floresta</div>
             <div style={{ backgroundColor: '#334155', borderBottom: '2px solid #222', padding: '15px', display: 'flex', justifyContent: 'flex-end', color: '#fff', fontSize: '1rem', fontWeight: 'bold' }}>⛰️ Montanhas</div>
             <div style={{ backgroundColor: '#0284c7', borderRight: '2px solid #222', padding: '15px', display: 'flex', alignItems: 'flex-end', color: '#fff', fontSize: '1rem', fontWeight: 'bold' }}>🌊 Oásis</div>
             <div style={{ backgroundColor: '#7c2d12', padding: '15px', display: 'flex', justifyContent: 'flex-end', alignItems: 'flex-end', color: '#fff', fontSize: '1rem', fontWeight: 'bold' }}>🔥 Deserto</div>
          </div>
          <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundImage: 'linear-gradient(rgba(255,255,255,0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.05) 1px, transparent 1px)', backgroundSize: '30px 30px', pointerEvents: 'none' }}></div>

          {/* Estruturas (Casas) */}
          {structures.map(struct => (
            <div key={struct.id} style={{
              position: 'absolute', left: `${struct.x}%`, top: `${struct.y}%`, transform: 'translate(-50%, -50%)',
              fontSize: '28px', zIndex: 5, filter: 'drop-shadow(0px 4px 2px rgba(0,0,0,0.5))'
            }}>
              🏘️
              <div style={{fontSize: '10px', backgroundColor: '#000', padding: '2px 4px', borderRadius: '4px', textAlign: 'center', marginTop: '-5px'}}>{struct.agent_name}</div>
            </div>
          ))}

          {/* Vidas Artificiais (Agentes) */}
          {agents.map(agent => agent.hp > 0 && (
            <div key={agent.id} style={{
              position: 'absolute', left: `${agent.x}%`, top: `${agent.y}%`, transform: 'translate(-50%, -50%)',
              transition: 'all 2s linear', display: 'flex', flexDirection: 'column', alignItems: 'center', zIndex: 10
            }}>
              {agent.society !== 'Nenhuma' && (
                <div style={{ backgroundColor: '#6d28d9', color: '#fff', fontSize: '10px', padding: '2px 6px', borderRadius: '4px', whiteSpace: 'nowrap', marginBottom: '2px', fontWeight: 'bold', border: '1px solid #c4b5fd' }}>
                  🛡️ {agent.society}
                </div>
              )}
              <div style={{ backgroundColor: '#000', color: '#fff', fontSize: '11px', padding: '2px 6px', borderRadius: '4px', whiteSpace: 'nowrap', marginBottom: '2px', border: '1px solid #4ade80' }}>
                {agent.name}
              </div>
              <div style={{ width: '28px', height: '28px', backgroundColor: '#f8fafc', border: '3px solid #000', borderRadius: '50%', display: 'flex', justifyContent: 'center', alignItems: 'center', fontSize: '16px', boxShadow: '0 4px 6px rgba(0,0,0,0.6)' }}>
                {agent.weapon > 0 ? '⚔️' : '🤖'}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* PAINÉIS DE DADOS */}
      <div style={{ display: 'flex', gap: '2rem', flexWrap: 'wrap' }}>
        
        {/* LOG DO MUNDO */}
        <section style={{ flex: '1 1 350px' }}>
          <h2>📜 Livro das Eras</h2>
          <div style={{ backgroundColor: '#111', padding: '1rem', borderRadius: '12px', border: '1px solid #333', height: '600px', overflowY: 'auto' }}>
            {events.map(ev => (
              <div key={ev.id} style={{ borderLeft: '3px solid #4ade80', paddingLeft: '10px', paddingBottom: '0.8rem', marginBottom: '0.8rem', borderBottom: '1px solid #222' }}>
                <span style={{ fontSize: '0.8rem', color: '#4ade80', fontWeight: 'bold' }}>[Tick {ev.tick}] {ev.type}</span>
                <p style={{ margin: '0.2rem 0 0', fontSize: '0.9rem', color: '#ccc' }}>{ev.message}</p>
              </div>
            ))}
          </div>
        </section>

        {/* INVENTÁRIO DOS AGENTES */}
        <section style={{ flex: '3 1 700px' }}>
          <h2>🧠 Mentes Ativas ({agents.filter(a => a.hp > 0).length})</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1rem' }}>
            {agents.map((agent) => (
              <div key={agent.id} style={{ backgroundColor: '#111', padding: '1.2rem', borderRadius: '12px', border: '1px solid #333', opacity: agent.hp <= 0 ? 0.3 : 1 }}>
                <h3 style={{ marginTop: 0, color: '#4ade80', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  {agent.name} {agent.hp <= 0 && '💀'}
                  <span style={{ fontSize: '0.9rem', backgroundColor: agent.hp > 20 ? '#7f1d1d' : '#000', color: '#fff', padding: '2px 8px', borderRadius: '4px' }}>❤️ {agent.hp}</span>
                </h3>
                
                <div style={{ display: 'flex', gap: '1rem', marginBottom: '0.5rem', backgroundColor: '#000', padding: '0.5rem', borderRadius: '6px', border: '1px solid #222' }}>
                  <span style={{ color: '#3b82f6', fontWeight: 'bold' }}>💧 Água: {agent.water}</span>
                  <span style={{ color: '#eab308', fontWeight: 'bold' }}>🍖 Comida: {agent.food}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1rem', backgroundColor: '#0f172a', padding: '0.5rem', borderRadius: '6px', border: '1px solid #1e293b', fontSize: '0.85rem' }}>
                  <span style={{ color: '#8b5cf6' }}>🪵 Mad: {agent.wood}</span>
                  <span style={{ color: '#94a3b8' }}>⛏️ Fer: {agent.iron}</span>
                  <span style={{ color: '#f87171' }}>⚔️ Arm: {agent.weapon}</span>
                  <span style={{ color: '#a3e635' }}>📍 [{agent.x}, {agent.y}]</span>
                </div>

                <p style={{ fontSize: '0.85rem', color: '#aaa', minHeight: '40px' }}><strong>Status:</strong> {agent.action}</p>
                
                {agent.hp > 0 && (
                  <div style={{ display: 'flex', marginTop: '1rem', gap: '0.5rem' }}>
                    <input type="text" placeholder="Intervir com milagre..." value={miracleText[agent.id] || ''} onChange={(e) => setMiracleText(prev => ({ ...prev, [agent.id]: e.target.value }))} style={{ flex: 1, padding: '0.5rem', backgroundColor: '#000', color: '#fff', border: '1px solid #555', borderRadius: '4px' }} />
                    <button onClick={() => sendMiracle(agent.id, agent.name)} style={{ padding: '0.5rem', cursor: 'pointer', backgroundColor: '#4ade80', color: '#000', border: 'none', borderRadius: '4px', fontWeight: 'bold' }}>Falar</button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>

      </div>
    </div>
  );
}