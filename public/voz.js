// ==========================================
// SISTEMA DE VOZ WEBRTC & HIERARQUIA (ESTILO DISCORD)
// ==========================================

let localStream = null;
let peerConnections = {};
let isMuted = false;
let socketVoz = null;
let salaVozAtual = null;

const rtcConfig = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' }
    ]
};

async function entrarCanalVoz(salaId, nickname, cargo) {
    salaVozAtual = salaId;
    const statusEl = document.getElementById('painel-voz-status');
    if (statusEl) statusEl.innerText = 'Estado: A conectar ao canal de voz...';

    try {
        if (!localStream) {
            localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
        }
        
        if (!socketVoz) {
            socketVoz = io();
        }

        socketVoz.emit('entrar_canal_voz', { salaId, nickname, cargo });

        socketVoz.off('utilizadores_no_voz');
        socketVoz.on('utilizadores_no_voz', (usuarios) => {
            atualizarListaVisualVoz(usuarios);
            gerenciarConexoesWebRTC(usuarios, socketVoz);
        });

        socketVoz.off('sinal_WebRTC');
        socketVoz.on('sinal_WebRTC', async ({ from, signal }) => {
            if (!peerConnections[from]) {
                peerConnections[from] = criarPeerConnection(from, socketVoz);
            }
            const pc = peerConnections[from];

            try {
                if (signal.type) {
                    const collision = signal.type === 'offer' && (pc.signalingState !== 'stable');
                    if (collision) return;

                    await pc.setRemoteDescription(new RTCSessionDescription(signal));
                    
                    if (signal.type === 'offer') {
                        const answer = await pc.createAnswer();
                        await pc.setLocalDescription(answer);
                        socketVoz.emit('sinal_WebRTC', { to: from, signal: pc.localDescription });
                    }
                } else if (signal.candidate) {
                    await pc.addIceCandidate(new RTCIceCandidate(signal));
                }
            } catch (err) {
                console.error("Erro no sinal WebRTC:", err);
            }
        });

        socketVoz.off('forcar_mute_servidor');
        socketVoz.on('forcar_mute_servidor', ({ mutado }) => {
            if (localStream) {
                localStream.getAudioTracks()[0].enabled = !mutado;
                isMuted = mutado;
                const btnMute = document.getElementById('btn-mute-audio');
                if (btnMute) btnMute.innerText = mutado ? 'Desmutado 🎙️ (Mutado pelo ADM)' : 'Mutar 🎙️';
            }
        });

        if (statusEl) statusEl.innerText = 'Estado: Conectado ao Canal de Voz 🔊';
    } catch (e) {
        console.error('Erro ao aceder ao microfone:', e);
        if (statusEl) statusEl.innerText = 'Estado: Erro ao aceder ao microfone (Permissão negada)';
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
        const cargoClass = `badge-cargo-${(u.cargo || 'soldado').toLowerCase()}`;
        grid.innerHTML += `
            <div style="background: rgba(30, 41, 59, 0.9); border: 1px solid rgba(88, 101, 242, 0.4); padding: 8px 12px; border-radius: 10px; display: flex; align-items: center; gap: 10px;">
                <div style="width: 32px; height: 32px; background: #5865f2; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: bold; color: #fff; font-size: 14px;">🔊</div>
                <div>
                    <div style="font-size: 13px; font-weight: bold; color: #fff;">${u.nickname}</div>
                    <span class="${cargoClass}" style="font-size: 10px; padding: 2px 6px;">${u.cargo}</span>
                </div>
            </div>
        `;
    });
}

function gerenciarConexoesWebRTC(usuarios, socket) {
    usuarios.forEach(u => {
        if (u.id !== socket.id && !peerConnections[u.id]) {
            const pc = criarPeerConnection(u.id, socket);
            peerConnections[u.id] = pc;
            
            pc.createOffer().then(offer => {
                return pc.setLocalDescription(offer);
            }).then(() => {
                socket.emit('sinal_WebRTC', { to: u.id, signal: pc.localDescription });
            }).catch(err => console.error("Erro ao criar offer:", err));
        }
    });
}

function criarPeerConnection(targetId, socket) {
    const pc = new RTCPeerConnection(rtcConfig);

    if (localStream) {
        localStream.getTracks().forEach(track => pc.addTrack(track, localStream));
    }

    pc.onicecandidate = event => {
        if (event.candidate) {
            socket.emit('sinal_WebRTC', { to: targetId, signal: event.candidate });
        }
    };

    pc.ontrack = event => {
        // Cria um elemento de áudio visível ou injeta com controls para podermos testar o play manual se necessário
        let audioElement = document.getElementById(`audio_${targetId}`);
        if (!audioElement) {
            audioElement = document.createElement('audio');
            audioElement.id = `audio_${targetId}`;
            audioElement.autoplay = true;
            audioElement.controls = true; // Deixa visível temporariamente para testes se necessário
            audioElement.style.display = 'block';
            audioElement.style.margin = '5px 0';
            document.body.appendChild(audioElement);
        }
        audioElement.srcObject = event.streams[0];
        audioElement.play().catch(err => {
            console.log("Autoplay bloqueado, clique no play do elemento de áudio gerado:", err);
        });
    };

    return pc;
}

function alternarMuteMicrofone() {
    if (!localStream) return;
    isMuted = !isMuted;
    localStream.getAudioTracks()[0].enabled = !isMuted;
    const btn = document.getElementById('btn-mute-audio');
    if (btn) {
        btn.innerText = isMuted ? 'Desmutar 🎙️' : 'Mutar 🎙️';
        btn.style.background = isMuted ? '#da373c' : '#5865f2';
    }
}

function sairCanalVoz() {
    if (socketVoz) {
        socketVoz.emit('sair_canal_voz');
    }
    if (localStream) {
        localStream.getTracks().forEach(track => track.stop());
        localStream = null;
    }
    Object.keys(peerConnections).forEach(id => {
        peerConnections[id].close();
        delete peerConnections[id];
    });
    document.querySelectorAll('audio[id^="audio_"]').forEach(el => el.remove());

    const statusEl = document.getElementById('painel-voz-status');
    if (statusEl) statusEl.innerText = 'Estado: Desconectado do Voz';

    const grid = document.getElementById('avatares-falando-grid');
    if (grid) grid.innerHTML = '<span style="color: #94a3b8; font-size: 13px;">Nenhum operacional conectado no voz no momento.</span>';
}