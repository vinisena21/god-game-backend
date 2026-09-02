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
      await fetch(`${API_URL}/api/world/weather`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ weather: newWeather }),
      });
      fetchData();
    } finally { setIsChanging(false); }
  };

  const sendMiracle = async (agentId: number, name: string) => {
    const text = miracleText[agentId];
    if (!text) return;
    try {
      const response = await fetch(`${API_URL}/api/agents/${agentId}/miracle`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text }),
      });
      if (response.ok) {
        alert(`⚡ A Voz Divina ecoou na mente de ${name}!`);
        setMiracleText(prev => ({ ...prev, [agentId]: '' }));
        fetchData();
      }
    } catch (error) {}
  };

  const resetWorld = async () => {
    if (!window.confirm("⚠️ ALERTA DO CRIADOR: Iniciar o BIG BANG? Isso apaga tudo.")) return;
    setIsChanging(true);
    try {
      await fetch(`${API_URL}/api/world/reset`, { method: 'POST' });
      fetchData();
    } finally { setIsChanging(false); }
  };

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 5000);
    return () => clearInterval(interval);
  }, []);

  const btnStyle = { padding: '0.5rem 1rem', cursor: isChanging ? 'wait' : 'pointer', backgroundColor: '#333', color: '#fff', border: '1px solid #555', borderRadius: '4px' };

  return (
    <div style={{ padding: '2rem', fontFamily: 'system-ui, sans-serif', backgroundColor: '#0a0a0a', color: '#e5e5e5', minHeight: '100vh' }}>
      <header style={{ borderBottom: '1px solid #333', paddingBottom: '1rem', marginBottom: '2rem' }}>
        <h1 style={{ margin: 0, color: '#fff' }}>👁️ Painel do Criador</h1>
      </header>

      <div style={{ display: 'flex', gap: '2rem', flexWrap: 'wrap', marginBottom: '2rem' }}>
        <section style={{ flex: '1 1 400px', backgroundColor: '#1a1a1a', padding: '1.5rem', borderRadius: '8px', border: '1px solid #333' }}>
          <h2>🌍 Controle Global</h2>
          <div style={{ display: 'flex', gap: '2rem', marginBottom: '1rem' }}>
            <p><strong>Tick Atual:</strong> {worldState.current_tick}</p>
            <p><strong style={{ color: '#4ade80' }}>Clima:</strong> {worldState.weather}</p>
          </div>
          <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
            <button disabled={isChanging} onClick={() => changeWeather('Ensolarado')} style={btnStyle}>☀️ Sol</button>
            <button disabled={isChanging} onClick={() => changeWeather('Chuva Torrencial')} style={btnStyle}>🌧️ Chuva</button>
            <button disabled={isChanging} onClick={() => changeWeather('Nevasca Extrema')} style={btnStyle}>❄️ Neve</button>
            <button disabled={isChanging} onClick={() => changeWeather('Seca Mortal')} style={btnStyle}>🔥 Seca</button>
            <button disabled={isChanging} onClick={() => changeWeather('Clima Instável')} style={{ ...btnStyle, backgroundColor: '#4c1d95', borderColor: '#7c3aed' }}>🌪️ Instável</button>
            <div style={{ flexGrow: 1 }}></div>
            <button disabled={isChanging} onClick={resetWorld} style={{ ...btnStyle, backgroundColor: '#7f1d1d', borderColor: '#ef4444', fontWeight: 'bold' }}>☄️ BIG BANG</button>
          </div>
        </section>

        {/* 🗺️ MAPA DE BIOMAS E BLOCOS */}
        <section style={{ flex: '1 1 400px', backgroundColor: '#1a1a1a', padding: '1.5rem', borderRadius: '8px', border: '1px solid #333' }}>
          <h2 style={{ margin: '0 0 1rem 0' }}>🗺️ Mapa dos Biomas</h2>
          <div style={{
            position: 'relative', width: '100%', height: '300px', 
            borderRadius: '8px', border: '4px solid #0f172a', overflow: 'hidden'
          }}>
            <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, display: 'grid', gridTemplateColumns: '50% 50%', gridTemplateRows: '50% 50%', opacity: 0.8 }}>
               <div style={{ backgroundColor: '#14532d', borderRight: '1px solid #333', borderBottom: '1px solid #333', display: 'flex', padding: '10px', color: '#fff', fontSize: '0.8rem', fontWeight: 'bold' }}>🌳 Floresta</div>
               <div style={{ backgroundColor: '#475569', borderBottom: '1px solid #333', display: 'flex', padding: '10px', justifyContent: 'flex-end', color: '#fff', fontSize: '0.8rem', fontWeight: 'bold' }}>⛰️ Montanhas</div>
               <div style={{ backgroundColor: '#0284c7', borderRight: '1px solid #333', display: 'flex', padding: '10px', alignItems: 'flex-end', color: '#fff', fontSize: '0.8rem', fontWeight: 'bold' }}>🌊 Oásis</div>
               <div style={{ backgroundColor: '#9a3412', display: 'flex', padding: '10px', justifyContent: 'flex-end', alignItems: 'flex-end', color: '#fff', fontSize: '0.8rem', fontWeight: 'bold' }}>🔥 Deserto</div>
            </div>
            <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundImage: 'linear-gradient(rgba(255,255,255,0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.05) 1px, transparent 1px)', backgroundSize: '20px 20px', pointerEvents: 'none' }}></div>

            {/* Renderiza as Estruturas (Muralhas e Fazendas) */}
            {structures.map(struct => (
              <div key={struct.id} style={{
                position: 'absolute',
                left: `${struct.x}%`, top: `${struct.y}%`,
                transform: 'translate(-50%, -50%)',
                fontSize: '18px', zIndex: 5
              }}>
                {struct.type === 'Muralha' ? '🧱' : '🌾'}
              </div>
            ))}

            {/* Renderiza os Agentes */}
            {agents.map(agent => agent.hp > 0 && (
              <div key={agent.id} style={{
                position: 'absolute',
                left: `${agent.x}%`, top: `${agent.y}%`,
                transform: 'translate(-50%, -50%)',
                transition: 'all 2s ease-in-out',
                display: 'flex', flexDirection: 'column', alignItems: 'center', zIndex: 10
              }}>
                <div style={{ backgroundColor: '#000', color: '#fff', fontSize: '10px', padding: '2px 6px', borderRadius: '4px', whiteSpace: 'nowrap', marginBottom: '2px', border: '1px solid #333' }}>
                  {agent.name}
                </div>
                <div style={{ width: '24px', height: '24px', backgroundColor: '#e2e8f0', border: '2px solid #000', borderRadius: '50%', display: 'flex', justifyContent: 'center', alignItems: 'center', fontSize: '14px', boxShadow: '0 0 5px rgba(0,0,0,0.5)' }}>
                  {agent.weapon > 0 ? '⚔️' : '🤖'}
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>

      <div style={{ display: 'flex', gap: '2rem', flexWrap: 'wrap' }}>
        <section style={{ flex: '3 1 600px' }}>
          <h2>🤖 Facções e Inventário</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(350px, 1fr))', gap: '1rem' }}>
            {agents.map((agent) => (
              <div key={agent.id} style={{ backgroundColor: '#1a1a1a', padding: '1.5rem', borderRadius: '8px', border: '1px solid #333', opacity: agent.hp <= 0 ? 0.5 : 1 }}>
                <h3 style={{ marginTop: 0, color: '#4ade80', display: 'flex', justifyContent: 'space-between' }}>
                  {agent.name} {agent.hp <= 0 && '💀'}
                  <span style={{ fontSize: '1rem', color: agent.hp > 20 ? '#ef4444' : '#7f1d1d' }}>❤️ {agent.hp} HP</span>
                </h3>
                
                <div style={{ display: 'flex', gap: '1rem', marginBottom: '0.5rem', backgroundColor: '#000', padding: '0.5rem', borderRadius: '6px', border: '1px solid #222' }}>
                  <span style={{ color: '#3b82f6', fontWeight: 'bold' }}>💧 Água: {agent.water}</span>
                  <span style={{ color: '#eab308', fontWeight: 'bold' }}>🍖 Comida: {agent.food}</span>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1rem', backgroundColor: '#0f172a', padding: '0.5rem', borderRadius: '6px', border: '1px solid #1e293b', fontSize: '0.9rem' }}>
                  <span style={{ color: '#8b5cf6' }}>🪵 Mad: {agent.wood || 0}</span>
                  <span style={{ color: '#94a3b8' }}>⛏️ Fer: {agent.iron || 0}</span>
                  <span style={{ color: '#f87171' }}>⚔️ Arm: {agent.weapon || 0}</span>
                  <span style={{ color: '#a3e635' }}>📍 [{agent.x}, {agent.y}]</span>
                </div>

                <p style={{ fontSize: '0.9rem' }}><strong>Ação:</strong> {agent.action}</p>
                
                {agent.hp > 0 && (
                  <div style={{ display: 'flex', marginTop: '1rem', gap: '0.5rem' }}>
                    <input type="text" placeholder="Sussurrar milagre..." value={miracleText[agent.id] || ''} onChange={(e) => setMiracleText(prev => ({ ...prev, [agent.id]: e.target.value }))} style={{ flex: 1, padding: '0.5rem', backgroundColor: '#000', color: '#fff', border: '1px solid #555', borderRadius: '4px' }} />
                    <button onClick={() => sendMiracle(agent.id, agent.name)} style={{ padding: '0.5rem', cursor: 'pointer', backgroundColor: '#4ade80', color: '#000', border: 'none', borderRadius: '4px', fontWeight: 'bold' }}>Falar</button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>

        <section style={{ flex: '1 1 300px' }}>
          <h2>📜 Livro das Eras</h2>
          <div style={{ backgroundColor: '#1a1a1a', padding: '1rem', borderRadius: '8px', border: '1px solid #333', maxHeight: '600px', overflowY: 'auto' }}>
            {events.map(ev => (
              <div key={ev.id} style={{ borderBottom: '1px solid #333', paddingBottom: '0.5rem', marginBottom: '0.5rem' }}>
                <span style={{ fontSize: '0.8rem', color: '#4ade80', fontWeight: 'bold' }}>[Tick {ev.tick}] {ev.type}</span>
                <p style={{ margin: '0.2rem 0 0', fontSize: '0.9rem', color: '#ccc' }}>{ev.message}</p>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}