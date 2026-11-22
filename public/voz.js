// ==========================================
// SISTEMA DE VOZ WEBRTC & HIERARQUIA (ESTILO DISCORD)
// ==========================================

let localStream = null;
let peerConnections = {};
let iceCandidateQueues = {};
let isMuted = false;
let socketVoz = null;
let salaVozAtual = 'sala_geral_salazar';
let conectadoNaCall = false;
let audioCtxSons = null;
let idsParticipantesAnteriores = new Set();

const rtcConfig = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        { urls: 'stun:stun2.l.google.com:19302' },
        { urls: 'stun:stun.services.mozilla.com' }
    ]
};

// ==========================================
// EFEITOS SONOROS VIA WEB AUDIO API (SEM ARQUIVOS EXTERNOS)
// ==========================================
function obterAudioContextSons() {
    if (!audioCtxSons) {
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        if (AudioCtx) {
            audioCtxSons = new AudioCtx();
        }
    }
    if (audioCtxSons && audioCtxSons.state === 'suspended') {
        audioCtxSons.resume().catch(() => {});
    }
    return audioCtxSons;
}

function tocarSomTom(frequencias, duracaoNota = 0.1, tipoOnda = 'sine', volumeMax = 0.15) {
    try {
        const ctx = obterAudioContextSons();
        if (!ctx) return;

        let tempoInicio = ctx.currentTime;
        frequencias.forEach((freq, idx) => {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();

            osc.type = tipoOnda;
            osc.frequency.setValueAtTime(freq, tempoInicio + (idx * duracaoNota));

            gain.gain.setValueAtTime(0.001, tempoInicio + (idx * duracaoNota));
            gain.gain.exponentialRampToValueAtTime(volumeMax, tempoInicio + (idx * duracaoNota) + 0.02);
            gain.gain.exponentialRampToValueAtTime(0.0001, tempoInicio + ((idx + 1) * duracaoNota));

            osc.connect(gain);
            gain.connect(ctx.destination);

            osc.start(tempoInicio + (idx * duracaoNota));
            osc.stop(tempoInicio + ((idx + 1) * duracaoNota));
        });
    } catch (e) {
        console.warn("Aviso ao reproduzir efeito sonoro de voz:", e);
    }
}

function tocarSomConectouCall() {
    // Tom suave ascendente (estilo Discord join)
    tocarSomTom([440, 660, 880], 0.09, 'sine', 0.14);
}

function tocarSomDesconectouCall() {
    // Tom suave descendente (estilo Discord leave)
    tocarSomTom([660, 440], 0.1, 'sine', 0.12);
}

function tocarSomMembroEntrouCall() {
    // Tom curto e límpido quando outro membro entra
    tocarSomTom([523.25, 659.25], 0.08, 'triangle', 0.12);
}

function tocarSomMembroSaiuCall() {
    // Tom curto quando outro membro sai
    tocarSomTom([659.25, 493.88], 0.08, 'sine', 0.1);
}

function obterSocketVoz() {
    if (!socketVoz) {
        if (typeof socket !== 'undefined' && socket) {
            socketVoz = socket;
        } else if (typeof io !== 'undefined') {
            socketVoz = io();
        }
    }
    return socketVoz;
}

// Inicializa a escuta para exibir quem está na call antes mesmo do usuário entrar
function inicializarEscutaVozGlobal() {
    const s = obterSocketVoz();
    if (!s) return;

    s.off('utilizadores_no_voz', tratarEventoUtilizadoresNoVoz);
    s.on('utilizadores_no_voz', tratarEventoUtilizadoresNoVoz);

    // Consulta inicial via API REST
    consultarParticipantesVoz();
}

function tratarEventoUtilizadoresNoVoz(payload) {
    let usuarios = [];
    if (Array.isArray(payload)) {
        usuarios = payload;
    } else if (payload && Array.isArray(payload.usuarios)) {
        usuarios = payload.usuarios;
    }
    atualizarListaVisualVoz(usuarios);

    const s = obterSocketVoz();
    const meuSocketId = s ? s.id : null;
    const idsAtuais = new Set(usuarios.map(u => u.id));

    // Se estiver conectado na call, toca efeito sonoro quando outros entram ou saem
    if (conectadoNaCall && meuSocketId) {
        // Detecta quem entrou (excluindo a si mesmo)
        for (const u of usuarios) {
            if (u.id !== meuSocketId && !idsParticipantesAnteriores.has(u.id)) {
                if (idsParticipantesAnteriores.size > 0) {
                    tocarSomMembroEntrouCall();
                }
                break;
            }
        }

        // Detecta quem saiu (excluindo a si mesmo)
        for (const idAnt of idsParticipantesAnteriores) {
            if (idAnt !== meuSocketId && !idsAtuais.has(idAnt)) {
                tocarSomMembroSaiuCall();
                break;
            }
        }

        gerenciarConexoesWebRTC(usuarios, s);
    }

    idsParticipantesAnteriores = idsAtuais;
    atualizarBarraVozPersistente();
}

async function consultarParticipantesVoz(salaId = 'sala_geral_salazar') {
    try {
        const res = await fetch(`/api/voz/participantes/${encodeURIComponent(salaId)}?_=${Date.now()}`);
        const data = await res.json();
        if (data.success && Array.isArray(data.usuarios)) {
            atualizarListaVisualVoz(data.usuarios);
        }
    } catch (e) {
        console.warn("Aviso ao carregar participantes de voz:", e);
    }
}

async function entrarCanalVoz(salaId, nickname, cargo) {
    salaVozAtual = salaId || 'sala_geral_salazar';
    const statusEl = document.getElementById('painel-voz-status');
    if (statusEl) statusEl.innerText = 'Estado: A solicitar microfone...';

    const s = obterSocketVoz();
    if (!s) {
        if (statusEl) statusEl.innerText = 'Estado: Erro ao conectar ao servidor de rádio.';
        return;
    }

    try {
        if (!localStream) {
            localStream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: true
                },
                video: false
            });
        }

        conectadoNaCall = true;
        isMuted = false;
        localStream.getAudioTracks().forEach(track => { track.enabled = true; });

        // Toca som de entrada na call
        tocarSomConectouCall();

        const btnMute = document.getElementById('btn-mute-audio');
        if (btnMute) {
            btnMute.innerText = 'Mutar 🎙️';
            btnMute.style.background = '#5865f2';
        }

        if (statusEl) statusEl.innerText = 'Estado: Conectado ao Canal de Voz 🔊';
        solicitarWakeLockVoz();
        atualizarBarraVozPersistente();

        // Registra listeners de WebRTC no socket
        s.off('sinal_WebRTC', tratarSinalWebRTC);
        s.on('sinal_WebRTC', tratarSinalWebRTC);

        s.off('forcar_mute_servidor');
        s.on('forcar_mute_servidor', ({ mutado }) => {
            if (localStream) {
                localStream.getAudioTracks().forEach(t => { t.enabled = !mutado; });
                isMuted = mutado;
                if (btnMute) {
                    btnMute.innerText = mutado ? 'Desmutar 🎙️ (Mutado pelo ADM)' : 'Mutar 🎙️';
                    btnMute.style.background = mutado ? '#da373c' : '#5865f2';
                }
                atualizarBarraVozPersistente();
            }
        });

        s.emit('entrar_canal_voz', { salaId: salaVozAtual, nickname, cargo });
    } catch (e) {
        console.error('Erro ao aceder ao microfone:', e);
        conectadoNaCall = false;
        if (statusEl) {
            statusEl.innerText = 'Estado: Erro ao aceder ao microfone (Verifique permissões)';
        }
    }
}

async function tratarSinalWebRTC({ from, signal }) {
    if (!conectadoNaCall || !localStream) return;
    const s = obterSocketVoz();

    if (!peerConnections[from]) {
        peerConnections[from] = criarPeerConnection(from, s);
    }
    const pc = peerConnections[from];

    try {
        if (signal.type) {
            // Se já temos uma offer em andamento (colisão), resolvemos comparando IDs (polite peer)
            if (signal.type === 'offer' && pc.signalingState !== 'stable') {
                if (s.id < from) {
                    return; // Peer impolite ignora nova offer durante colisão
                }
                await Promise.all([
                    pc.setLocalDescription({ type: 'rollback' }).catch(() => {}),
                    pc.setRemoteDescription(new RTCSessionDescription(signal))
                ]);
            } else {
                await pc.setRemoteDescription(new RTCSessionDescription(signal));
            }

            // Drena candidatos ICE que chegaram antes da descrição remota
            if (iceCandidateQueues[from] && iceCandidateQueues[from].length > 0) {
                for (const candidate of iceCandidateQueues[from]) {
                    try {
                        await pc.addIceCandidate(new RTCIceCandidate(candidate));
                    } catch (candErr) {
                        console.warn("Erro ao adicionar ICE drenado:", candErr);
                    }
                }
                iceCandidateQueues[from] = [];
            }

            if (signal.type === 'offer') {
                const answer = await pc.createAnswer();
                await pc.setLocalDescription(answer);
                s.emit('sinal_WebRTC', { to: from, signal: pc.localDescription });
            }
        } else if (signal.candidate) {
            if (!pc.remoteDescription || !pc.remoteDescription.type) {
                if (!iceCandidateQueues[from]) iceCandidateQueues[from] = [];
                iceCandidateQueues[from].push(signal);
            } else {
                try {
                    await pc.addIceCandidate(new RTCIceCandidate(signal));
                } catch (candErr) {
                    console.warn("Erro ao adicionar ICE candidate:", candErr);
                }
            }
        }
    } catch (err) {
        console.error("Erro no processamento do sinal WebRTC:", err);
    }
}

function atualizarListaVisualVoz(usuarios) {
    const grid = document.getElementById('avatares-falando-grid');
    if (!grid) return;

    if (!usuarios || usuarios.length === 0) {
        grid.innerHTML = '<span style="color: #94a3b8; font-size: 13px;">Nenhum operacional conectado no voz no momento.</span>';
        return;
    }

    grid.innerHTML = '';
    usuarios.forEach(u => {
        const cargoLimpo = (u.cargo || 'soldado').toLowerCase().replace(/[^a-z0-9-]/g, '');
        const cargoClass = `badge-cargo-${cargoLimpo}`;
        const nickEscape = String(u.nickname || 'Operacional')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');
        const cargoEscape = String(u.cargo || 'Privado')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');

        grid.innerHTML += `
            <div style="background: rgba(30, 41, 59, 0.9); border: 1px solid rgba(88, 101, 242, 0.4); padding: 8px 12px; border-radius: 10px; display: flex; align-items: center; gap: 10px;">
                <div style="width: 32px; height: 32px; background: #5865f2; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: bold; color: #fff; font-size: 14px;">🔊</div>
                <div>
                    <div style="font-size: 13px; font-weight: bold; color: #fff;">${nickEscape}</div>
                    <span class="${cargoClass}" style="font-size: 10px; padding: 2px 6px;">${cargoEscape}</span>
                </div>
            </div>
        `;
    });
}

function gerenciarConexoesWebRTC(usuarios, socket) {
    if (!socket || !socket.id) return;

    // Remove conexões de usuários que saíram
    const idsPresentes = new Set(usuarios.map(u => u.id));
    Object.keys(peerConnections).forEach(id => {
        if (!idsPresentes.has(id)) {
            fecharConexaoPeer(id);
        }
    });

    // Inicia oferta apenas se o nosso socket.id for "menor" lexicograficamente (evita ofertas duplicadas cruzadas)
    usuarios.forEach(u => {
        if (u.id !== socket.id && !peerConnections[u.id]) {
            const pc = criarPeerConnection(u.id, socket);
            peerConnections[u.id] = pc;

            if (socket.id < u.id) {
                pc.createOffer().then(offer => {
                    return pc.setLocalDescription(offer);
                }).then(() => {
                    socket.emit('sinal_WebRTC', { to: u.id, signal: pc.localDescription });
                }).catch(err => console.error("Erro ao criar offer WebRTC:", err));
            }
        }
    });
}

function criarPeerConnection(targetId, socket) {
    const pc = new RTCPeerConnection(rtcConfig);

    if (localStream) {
        localStream.getTracks().forEach(track => {
            pc.addTrack(track, localStream);
        });
    }

    pc.onicecandidate = event => {
        if (event.candidate && socket) {
            socket.emit('sinal_WebRTC', { to: targetId, signal: event.candidate });
        }
    };

    pc.ontrack = event => {
        const streamRemoto = event.streams && event.streams[0] ? event.streams[0] : new MediaStream([event.track]);
        let audioElement = document.getElementById(`audio_${targetId}`);
        if (!audioElement) {
            audioElement = document.createElement('audio');
            audioElement.id = `audio_${targetId}`;
            audioElement.autoplay = true;
            audioElement.playsInline = true;
            audioElement.volume = 1.0;
            audioElement.style.display = 'none';
            document.body.appendChild(audioElement);
        }
        audioElement.srcObject = streamRemoto;
        const playProm = audioElement.play();
        if (playProm !== undefined) {
            playProm.catch(() => {
                // Se o navegador bloquear autoplay sem interação, tenta no primeiro clique da página
                const desbloquearAudio = () => {
                    audioElement.play().catch(() => {});
                    window.removeEventListener('click', desbloquearAudio);
                };
                window.addEventListener('click', desbloquearAudio, { once: true });
            });
        }
    };

    pc.onconnectionstatechange = () => {
        if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed' || pc.connectionState === 'closed') {
            fecharConexaoPeer(targetId);
        }
    };

    return pc;
}

function fecharConexaoPeer(targetId) {
    if (peerConnections[targetId]) {
        try {
            peerConnections[targetId].close();
        } catch (e) {}
        delete peerConnections[targetId];
    }
    delete iceCandidateQueues[targetId];
    const el = document.getElementById(`audio_${targetId}`);
    if (el) {
        el.srcObject = null;
        el.remove();
    }
}

function alternarMuteMicrofone() {
    if (!localStream) return;
    isMuted = !isMuted;
    localStream.getAudioTracks().forEach(track => {
        track.enabled = !isMuted;
    });

    const btn = document.getElementById('btn-mute-audio');
    if (btn) {
        btn.innerText = isMuted ? 'Desmutar 🎙️' : 'Mutar 🎙️';
        btn.style.background = isMuted ? '#da373c' : '#5865f2';
    }

    atualizarBarraVozPersistente();
}

function sairCanalVoz() {
    if (conectadoNaCall) {
        tocarSomDesconectouCall();
    }

    const s = obterSocketVoz();
    if (s) {
        s.emit('sair_canal_voz');
    }
    conectadoNaCall = false;

    if (localStream) {
        localStream.getTracks().forEach(track => track.stop());
        localStream = null;
    }

    Object.keys(peerConnections).forEach(id => {
        fecharConexaoPeer(id);
    });
    iceCandidateQueues = {};
    idsParticipantesAnteriores.clear();

    const statusEl = document.getElementById('painel-voz-status');
    if (statusEl) statusEl.innerText = 'Estado: Desconectado do Voz';

    const btnMute = document.getElementById('btn-mute-audio');
    if (btnMute) {
        btnMute.innerText = 'Mutar 🎙️';
        btnMute.style.background = '#5865f2';
    }

    liberarWakeLockVoz();
    atualizarBarraVozPersistente();

    // Consulta e atualiza lista visual remanescente
    consultarParticipantesVoz(salaVozAtual);
}

// Atualiza o indicador persistente de call visível em todas as abas
function atualizarBarraVozPersistente() {
    const barra = document.getElementById('barraVozPersistente');
    if (!barra) return;

    if (!conectadoNaCall) {
        barra.style.display = 'none';
        return;
    }

    barra.style.display = 'flex';

    const btnMuteBarra = document.getElementById('btnMuteBarraPersistente');
    if (btnMuteBarra) {
        btnMuteBarra.innerHTML = isMuted ? '🔇 Desmutar' : '🎙️ Mutar';
        btnMuteBarra.style.background = isMuted ? 'rgba(239, 68, 68, 0.25)' : 'rgba(56, 189, 248, 0.2)';
        btnMuteBarra.style.borderColor = isMuted ? '#ef4444' : '#38bdf8';
        btnMuteBarra.style.color = isMuted ? '#fca5a5' : '#38bdf8';
    }

    const qtdEl = document.getElementById('qtdParticipantesBarraPersistente');
    if (qtdEl) {
        const count = idsParticipantesAnteriores.size || 1;
        qtdEl.innerText = `${count} na call`;
    }
}

// ==========================================
// RESILIÊNCIA EM SEGUNDO PLANO (VISIBILITY CHANGE / FOCUS / BACKGROUND RECOVERY)
// ==========================================
let wakeLockVoz = null;

async function solicitarWakeLockVoz() {
    try {
        if ('wakeLock' in navigator && conectadoNaCall) {
            wakeLockVoz = await navigator.wakeLock.request('screen');
            wakeLockVoz.addEventListener('release', () => {
                wakeLockVoz = null;
            });
        }
    } catch (e) {
        // Ignora caso a política de economia de bateria bloqueie
    }
}

function liberarWakeLockVoz() {
    if (wakeLockVoz) {
        wakeLockVoz.release().catch(() => {});
        wakeLockVoz = null;
    }
}

async function revalidarAudioCallAposSegundoPlano() {
    if (!conectadoNaCall) return;

    // 1. Reativa contexto de áudio sintetizado
    if (audioCtxSons && audioCtxSons.state === 'suspended') {
        audioCtxSons.resume().catch(() => {});
    }

    // 2. Revalida tracks de microfone local caso o sistema móvel tenha silenciado
    if (localStream) {
        localStream.getAudioTracks().forEach(track => {
            if (track.readyState === 'ended') {
                console.warn("Track de microfone finalizado em segundo plano. Solicitando novo stream...");
                navigator.mediaDevices.getUserMedia({
                    audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
                    video: false
                }).then(novoStream => {
                    localStream = novoStream;
                    localStream.getAudioTracks().forEach(t => { t.enabled = !isMuted; });
                    // Atualiza tracks em todos os RTCPeerConnection ativos
                    Object.values(peerConnections).forEach(pc => {
                        const sender = pc.getSenders().find(s => s.track && s.track.kind === 'audio');
                        if (sender) {
                            sender.replaceTrack(novoStream.getAudioTracks()[0]).catch(() => {});
                        }
                    });
                }).catch(() => {});
            } else {
                track.enabled = !isMuted;
            }
        });
    }

    // 3. Reativa reprodução de todos os elementos de áudio remoto suspensos
    document.querySelectorAll('audio[id^="audio_"]').forEach(el => {
        if (el.paused && el.srcObject) {
            el.play().catch(err => {
                console.log("Aguardando interação para reproduzir áudio após segundo plano:", err);
            });
        }
    });

    // 4. Verifica integridade do WebSocket
    const s = obterSocketVoz();
    if (s && !s.connected) {
        s.connect();
        s.emit('entrar_canal_voz', { salaId: salaVozAtual, nickname: (typeof user !== 'undefined' ? user.nickname : 'Operacional') });
    }

    atualizarBarraVozPersistente();
}

// Ouvintes para restaurar conexão ao voltar da aba minimizada ou tela inativa
document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
        revalidarAudioCallAposSegundoPlano();
    }
});
window.addEventListener('focus', revalidarAudioCallAposSegundoPlano);
window.addEventListener('pageshow', revalidarAudioCallAposSegundoPlano);

// Inicializa a escuta assim que o script é carregado
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', inicializarEscutaVozGlobal);
} else {
    inicializarEscutaVozGlobal();
}
