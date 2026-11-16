const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const dotenv = require('dotenv');
const cors = require('cors');
const webpush = require('web-push');
const path = require('path');
const conectarDB = require('./config/db');
const User = require('./models/User');
const ConfigSorteio = require('./models/ConfigSorteio');
const LogAdmin = require('./models/LogAdmin');

dotenv.config();
conectarDB();

const publicVapidKey = process.env.VAPID_PUBLIC_KEY || 'BE5CpajXiRi74CjMe6B0ooSqHupNpbsu1otJVlH5t0t5h6tVJmL8PTVGlkSTPWIdAlIwra6WjFsTcy9sBgii8wQ';
const privateVapidKey = process.env.VAPID_PRIVATE_KEY || 'zpTFhXUSrW9O8iuzIMZ_-_322JymestIXnunAraP65M';

try {
    webpush.setVapidDetails(
        'mailto:rafael.limaaypa@gmail.com', 
        publicVapidKey, 
        privateVapidKey
    );
    console.log("Chaves VAPID configuradas com sucesso!");
} catch (e) {
    console.error("Erro ao configurar VAPID keys:", e);
}

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST", "PUT", "DELETE"]
  }
});

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));
app.use(cors());

app.use(express.static(__dirname));
app.use(express.static(path.join(__dirname, 'public')));

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/sw.js', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'sw.js'));
});

async function registarLogAdmin(autor, acao, detalhes) {
    try {
        await LogAdmin.create({
            autor: autor || 'Sistema',
            acao: acao,
            detalhes: detalhes,
            data: new Date()
        });
        io.emit('atualizar_logs_admin');
    } catch (e) {
        console.error("Erro ao gravar log admin:", e);
    }
}

function converterDuracaoParaSegundos(duracaoStr) {
  if (!duracaoStr) return 0;
  const partes = duracaoStr.split(':');
  if (partes.length !== 3) return 0;
  return (parseInt(partes[0]) * 3600) + (parseInt(partes[1]) * 60) + parseInt(partes[2]);
}

function converterSegundosParaDuracao(segundosTotais) {
  const segundosSeguros = Math.max(0, parseInt(segundosTotais) || 0);
  const horas = String(Math.floor(segundosSeguros / 3600)).padStart(2, '0');
  const minutos = String(Math.floor((segundosSeguros % 3600) / 60)).padStart(2, '0');
  const segundos = String(segundosSeguros % 60).padStart(2, '0');
  return `${horas}:${minutos}:${segundos}`;
}

function obterDataCicloBrasil() {
    const agoraBrasilStr = new Date().toLocaleString("en-US", { timeZone: "America/Sao_Paulo" });
    const agoraBrasil = new Date(agoraBrasilStr);
    if (agoraBrasil.getHours() < 2) {
        agoraBrasil.setDate(agoraBrasil.getDate() - 1);
    }
    return agoraBrasil.toISOString().split('T')[0];
}

function calcularSegundosValidosNoHorario(inicioTimestamp, fimTimestamp) {
    const inicio = new Date(inicioTimestamp);
    const fim = new Date(fimTimestamp);
    if (fim <= inicio) return 0;

    const janelaInicio = new Date(inicio);
    if (janelaInicio.getHours() < 2) {
        janelaInicio.setDate(janelaInicio.getDate() - 1);
    }
    janelaInicio.setHours(17, 0, 0, 0);

    const janelaFim = new Date(janelaInicio);
    janelaFim.setDate(janelaFim.getDate() + 1);
    janelaFim.setHours(2, 0, 0, 0);

    const inicioValido = Math.max(inicio.getTime(), janelaInicio.getTime());
    const fimValido = Math.min(fim.getTime(), janelaFim.getTime());

    if (fimValido <= inicioValido) return 0;

    return Math.floor((fimValido - inicioValido) / 1000);
}

function turnoEstaNoHorarioPermitido(t) {
    if (!t) return false;
    if (t.fotoComprovante && t.fotoComprovante.includes('Injeção Manual')) return true;
    
    const dataTurno = t.data;
    if (!dataTurno) return false;
    const d = new Date(dataTurno);
    const horaStr = d.toLocaleString("en-US", { timeZone: "America/Sao_Paulo", hour: 'numeric', hour12: false });
    const hora = parseInt(horaStr, 10);
    return (hora >= 17 && hora <= 23) || (hora >= 0 && hora < 2);
}

function turnoPertenceAoCicloAtual(t) {
    if (!t) return false;
    if (t.fotoComprovante && t.fotoComprovante.includes('Injeção Manual')) return true;

    const dataTurno = t.data;
    if (!dataTurno) return false;
    const d = new Date(dataTurno);
    const agoraStr = new Date().toLocaleString("en-US", { timeZone: "America/Sao_Paulo" });
    const agora = new Date(agoraStr);
    const horaAtual = agora.getHours();

    const dBrasilStr = d.toLocaleString("en-US", { timeZone: "America/Sao_Paulo" });
    const dBrasil = new Date(dBrasilStr);

    if (horaAtual >= 0 && horaAtual < 3) {
        const ontem = new Date(agora);
        ontem.setDate(ontem.getDate() - 1);
        
        const dDataOnly = dBrasil.toISOString().split('T')[0];
        const hojeDataOnly = agora.toISOString().split('T')[0];
        const ontemDataOnly = ontem.toISOString().split('T')[0];

        return dDataOnly === hojeDataOnly || dDataOnly === ontemDataOnly;
    } else {
        const dStr = dBrasil.toLocaleDateString("en-US");
        const hojeStr = agora.toLocaleDateString("en-US");
        return dStr === hojeStr;
    }
}

// --- ROTAS DO LINK DO WHATSAPP ---
app.get('/api/admin/whatsapp-link', async (req, res) => {
    try {
        const config = await ConfigSorteio.collection.findOne({ chave: 'whatsapp_grupo' });
        res.json({ success: true, link: config ? config.link : '' });
    } catch (e) {
        console.error("Erro ao buscar link WhatsApp:", e);
        res.status(500).json({ success: false, message: 'Erro ao buscar link do WhatsApp' });
    }
});

app.post('/api/admin/whatsapp-link', async (req, res) => {
    try {
        const { adminNickname, link } = req.body;
        
        await ConfigSorteio.collection.updateOne(
            { chave: 'whatsapp_grupo' },
            { 
                $set: { 
                    chave: 'whatsapp_grupo',
                    link: link || '', 
                    atualizadoPor: adminNickname || 'Comando', 
                    data: new Date() 
                } 
            },
            { upsert: true }
        );

        await registarLogAdmin(adminNickname || 'Comando', 'Atualizou Link do WhatsApp', `Novo link configurado: ${link}`);
        res.json({ success: true, message: 'Link do WhatsApp atualizado com sucesso!' });
    } catch (e) {
        console.error("Erro ao salvar link WhatsApp:", e);
        res.status(500).json({ success: false, message: 'Erro ao salvar link do WhatsApp' });
    }
});

// --- VERIFICAÇÃO AUTOMÁTICA DE FECHO DE TURNO ÀS 02:05 ---
async function verificarFechamentoAutomaticoTurnos() {
    try {
        const agoraBrasilStr = new Date().toLocaleString("en-US", { timeZone: "America/Sao_Paulo" });
        const agoraBrasil = new Date(agoraBrasilStr);
        const hora = agoraBrasil.getHours();
        const minuto = agoraBrasil.getMinutes();

        if (hora === 2 && minuto >= 5 && minuto <= 7) {
            const membrosEmPlantao = await User.find({ emPlantao: true }).lean();
            
            for (const membro of membrosEmPlantao) {
                let segundosTotais = membro.segundosAcumulados || 0;
                if (membro.inicioPlantao) {
                    const inicio = new Date(membro.inicioPlantao);
                    const agora = new Date();
                    const segundosDecorridos = Math.floor((agora - inicio) / 1000);
                    if (segundosDecorridos > 0) segundosTotais += segundosDecorridos;
                }

                if (segundosTotais >= 5) {
                    const duracaoFormatada = converterSegundosParaDuracao(segundosTotais);
                    const novoTurno = {
                        data: new Date(),
                        duracao: duracaoFormatada,
                        fotoComprovante: 'Fechamento Automático (Limite 02:05)'
                    };

                    await User.updateOne(
                        { _id: membro._id },
                        { 
                            $push: { 
                                historicoTurnos: novoTurno,
                                caixaEntrada: {
                                    titulo: '⏱️ Turno Finalizado Automaticamente',
                                    mensagem: `O teu plantão foi encerrado e salvo automaticamente pelo sistema devido ao atingimento do horário limite (02:05). Duração: <b>${duracaoFormatada}</b>.`,
                                    data: new Date()
                                }
                            }, 
                            $set: { 
                                emPlantao: false, 
                                estadoTurno: 'parado',
                                inicioPlantao: null,
                                segundosAcumulados: 0,
                                fotoComprovanteAtiva: ''
                            } 
                        }
                    );

                    io.emit('atualizar_estado_turno_usuario', { nickname: membro.nickname.toLowerCase() });
                    await registarLogAdmin(membro.nickname, 'Fechamento Automático', `Turno encerrado às 02:05. Duração salva: ${duracaoFormatada}`);
                }
            }
            if (membrosEmPlantao.length > 0) {
                io.emit('atualizar_status_geral_tropa');
                console.log(`[AUTO-CLOSE] Fechados turnos automáticos de ${membrosEmPlantao.length} operacionais às 02:05.`);
            }
        }
    } catch (e) {
        console.error("Erro no processo automático de fecho de turnos:", e);
    }
}
setInterval(verificarFechamentoAutomaticoTurnos, 60000);

// --- SISTEMA AUTOMÁTICO DE ALERTA DE INATIVIDADE (+3 DIAS SEM TURNO) ---
async function verificarInatividadeTropa() {
    try {
        const agora = new Date();
        const tresDiasAtras = new Date(agora.getTime() - (3 * 24 * 60 * 60 * 1000));

        const membros = await User.find({ status: 'ativo' }).lean();
        for (const membro of membros) {
            const turnos = membro.historicoTurnos || [];
            let ultimoTurnoData = membro._id.getTimestamp();

            if (turnos.length > 0) {
                const ultimo = turnos[turnos.length - 1];
                if (ultimo.data) ultimoTurnoData = new Date(ultimo.data);
            }

            if (ultimoTurnoData < tresDiasAtras) {
                const jaNotificadoRecente = (membro.caixaEntrada || []).some(n => 
                    n.titulo && n.titulo.includes('Inatividade') && (agora - new Date(n.data)) < 24 * 60 * 60 * 1000
                );

                if (!jaNotificadoRecente) {
                    await User.updateOne(
                        { _id: membro._id },
                        {
                            $push: {
                                caixaEntrada: {
                                    titulo: '⚠️ Aviso de Inatividade',
                                    mensagem: 'Atenção: Detetámos que está há mais de 3 dias sem registar turnos na organização!',
                                    data: new Date()
                                }
                            }
                        }
                    );
                    await registarLogAdmin('Sistema', 'Alerta de Inatividade', `Operacional ${membro.nickname} está há mais de 3 dias sem turnos.`);
                }
            }
        }
    } catch (e) {
        console.error("Erro ao verificar inatividade:", e);
    }
}
setInterval(verificarInatividadeTropa, 4 * 60 * 60 * 1000);

// --- ROTAS DE AUTENTICAÇÃO ---
app.post('/api/auth/login', async (req, res) => {
    try {
        const { nickname, senha, password } = req.body;
        const passFinal = senha || password;
        if (!nickname || !passFinal) return res.status(400).json({ success: false, message: 'Preencha os campos.' });
        
        const user = await User.findOne({ nickname: new RegExp('^' + nickname.trim() + '$', 'i') }).select('-historicoTurnos.fotoComprovante').lean();
        if (!user) return res.status(400).json({ success: false, message: 'Utilizador não encontrado.' });
        if (user.password && user.password !== passFinal) {
            return res.status(400).json({ success: false, message: 'Senha incorreta.' });
        }
        if (user.status === 'pendente') {
            return res.status(403).json({ success: false, message: 'A sua conta aguarda aprovação do Comando para ter acesso ao site.' });
        }

        await registarLogAdmin(user.nickname, 'Login no Sistema', `Utilizador ${user.nickname} efetuou login.`);
        res.json({ success: true, message: 'Login bem-sucedido', user: { nickname: user.nickname, cargo: user.cargo, role: user.role, status: user.status } });
    } catch (e) {
        res.status(500).json({ success: false, message: 'Erro no servidor.' });
    }
});

app.post('/api/auth/register', async (req, res) => {
    try {
        const { nickname, senha, password } = req.body;
        const passFinal = senha || password;
        if (!nickname || !passFinal) return res.status(400).json({ success: false, message: 'Preencha o nickname e a senha.' });

        const userExiste = await User.findOne({ nickname: new RegExp('^' + nickname.trim() + '$', 'i') });
        if (userExiste) return res.status(400).json({ success: false, message: 'Este nickname já está registado.' });

        const novoUtilizador = new User({
            nickname: nickname.trim(),
            password: passFinal,
            cargo: 'Privado',
            status: 'pendente'
        });

        await novoUtilizador.save();
        await registarLogAdmin(nickname.trim(), 'Registo de Conta', `Novo registo de conta pendente para ${nickname.trim()}.`);
        res.json({ success: true, message: 'Conta registada com sucesso! Aguarde aprovação.' });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Erro ao registar conta na base de dados.' });
    }
});

app.get('/api/membro/perfil/:nickname', async (req, res) => {
    try {
        const membro = await User.findOne({ nickname: new RegExp('^' + req.params.nickname + '$', 'i') }).lean();
        if (!membro) return res.status(404).json({ success: false, message: 'Membro não encontrado.' });

        let totalSegundos = 0;
        if (membro.historicoTurnos) {
            membro.historicoTurnos.forEach(t => {
                totalSegundos += converterDuracaoParaSegundos(t.duracao);
            });
        }
        const h = Math.floor(totalSegundos / 3600);
        const m = Math.floor((totalSegundos % 3600) / 60);
        const s = totalSegundos % 60;
        const totalHorasFormatado = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;

        const dataCriacao = membro._id.getTimestamp();
        const agora = new Date();
        const diffTempo = Math.abs(agora - dataCriacao);
        const diffDias = Math.floor(diffTempo / (1000 * 60 * 60 * 24));
        const tempoGestaoStr = diffDias === 0 ? 'Menos de 1 dia' : `${diffDias} dia(s) na organização`;

        const ultimoTurno = membro.historicoTurnos && membro.historicoTurnos.length > 0 
            ? `${membro.historicoTurnos[membro.historicoTurnos.length - 1].duracao} (${new Date(membro.historicoTurnos[membro.historicoTurnos.length - 1].data).toLocaleDateString()})` 
            : 'Nenhum';

        res.json({
            success: true,
            perfil: {
                nickname: membro.nickname,
                cargo: membro.cargo || 'Privado',
                status: membro.status || 'ativo',
                avatar: membro.avatar || '',
                telefone: membro.telefone || '',
                totalHoras: totalHorasFormatado,
                tempoGestao: tempoGestaoStr,
                ultimoPlantao: ultimoTurno
            }
        });
    } catch (e) {
        res.status(500).json({ success: false, message: 'Erro ao carregar perfil.' });
    }
});

app.put('/api/membro/atualizar-avatar', async (req, res) => {
    try {
        const { nickname, avatar } = req.body;
        if (!nickname) return res.status(400).json({ success: false, message: 'Nickname obrigatório.' });

        await User.updateOne(
            { nickname: new RegExp('^' + nickname.trim() + '$', 'i') },
            { $set: { avatar: avatar || '' } }
        );

        res.json({ success: true, message: 'Avatar atualizado com sucesso!' });
    } catch (e) {
        res.status(500).json({ success: false, message: 'Erro ao atualizar avatar.' });
    }
});

app.put('/api/membro/atualizar-perfil', async (req, res) => {
    try {
        const { nickname, telefone, avatar } = req.body;
        if (!nickname) return res.status(400).json({ success: false, message: 'Nickname obrigatório.' });

        const updateData = {};
        if (telefone !== undefined) {
            updateData.telefone = telefone;
            await registarLogAdmin(nickname, 'Atualizou Telemóvel / WhatsApp', `Operacional ${nickname} definiu o número de telemóvel: ${telefone}`);
        }
        if (avatar !== undefined) updateData.avatar = avatar;

        await User.updateOne(
            { nickname: new RegExp('^' + nickname.trim() + '$', 'i') },
            { $set: updateData }
        );

        res.json({ success: true, message: 'Perfil atualizado com sucesso!' });
    } catch (e) {
        res.status(500).json({ success: false, message: 'Erro ao atualizar perfil.' });
    }
});

app.get('/api/membro/historico/:nickname', async (req, res) => {
    try {
        const membro = await User.findOne({ nickname: new RegExp('^' + req.params.nickname + '$', 'i') }, '-password -historicoTurnos.fotoComprovante').lean();
        if (!membro) return res.status(404).json({ success: false, message: 'Membro não encontrado.' });

        const ultimoTurno = membro.historicoTurnos && membro.historicoTurnos.length > 0 
            ? membro.historicoTurnos[membro.historicoTurnos.length - 1] 
            : null;

        res.json({
            success: true,
            membro: {
                nickname: membro.nickname,
                cargo: membro.cargo || 'Privado',
                status: membro.status || 'Ativo',
                emPlantao: !!membro.emPlantao,
                estadoTurno: membro.estadoTurno || 'parado',
                inicioPlantao: membro.inicioPlantao || null,
                segundosAcumulados: membro.segundosAcumulados || 0,
                fotoComprovanteAtiva: membro.fotoComprovanteAtiva || '',
                ultimoPlantao: ultimoTurno ? `Duração: ${ultimoTurno.duracao} em ${new Date(ultimoTurno.data).toLocaleDateString()}` : 'Nenhum plantão registado'
            },
            historicoTurnos: membro.historicoTurnos || [],
            historicoPromocoes: membro.historicoPromocoes || [],
            historicoSorteios: membro.historicoSorteios || [],
            caixaEntrada: membro.caixaEntrada || []
        });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Erro ao carregar histórico.' });
    }
});

app.post('/api/membro/salvar-subscricao-push', async (req, res) => {
    try {
        const { nickname, subscription } = req.body;
        if (!nickname || !subscription) return res.status(400).json({ success: false, message: 'Dados incompletos.' });

        await User.updateOne(
            { nickname: new RegExp('^' + nickname.trim() + '$', 'i') },
            { $set: { pushSubscription: subscription } }
        );

        res.json({ success: true, message: 'Subscrição push guardada com sucesso!' });
    } catch (e) {
        res.status(500).json({ success: false, message: 'Erro no servidor.' });
    }
});

app.post('/api/admin/disparar-acao', async (req, res) => {
    try {
        const { adminNickname, tituloAcao, descricaoAcao, titulo, descricao } = req.body;
        const tituloFinal = tituloAcao || titulo || 'ALERTA DE AÇÃO';
        const descricaoFinal = descricaoAcao || descricao || 'Convocação urgente do Comando! Apresente-se imediatamente.';

        if (adminNickname) {
            const adminUser = await User.findOne({ nickname: new RegExp('^' + adminNickname + '$', 'i') }).lean();
            const cargoAdmin = adminUser ? (adminUser.cargo || '') : '';
            const ehAdminValido = adminUser && (adminUser.role === 'admin' || cargoAdmin === 'General' || cargoAdmin === 'Coronel All');
            
            if (!ehAdminValido) {
                return res.status(403).json({ success: false, message: 'Acesso negado. Apenas o Comando Superior (General ou Coronel All) pode disparar ações.' });
            }
        }

        const membrosComPush = await User.find({ pushSubscription: { $exists: true, $ne: null } }).lean();
        const payload = JSON.stringify({
            title: `🚨 AÇÃO: ${tituloFinal}`,
            body: descricaoFinal,
            url: '/dashboard.html'
        });

        let enviados = 0;
        for (const membro of membrosComPush) {
            if (membro.pushSubscription && membro.pushSubscription.endpoint) {
                try {
                    await webpush.sendNotification(membro.pushSubscription, payload);
                    enviados++;
                } catch (err) {}
            }
        }

        const notifGeral = {
            titulo: `🚨 ALERTA DE AÇÃO: ${tituloFinal}`,
            mensagem: descricaoFinal,
            data: new Date()
        };
        await User.updateMany({}, { $push: { caixaEntrada: notifGeral } });

        io.emit('tocar_alarme_acao', { titulo: tituloFinal, descricao: descricaoFinal });
        io.emit('atualizar_status_geral_tropa');

        await registarLogAdmin(adminNickname || 'Comando', 'Alarme Geral Disparado', `Ação: ${tituloFinal}`);
        res.json({ success: true, message: `Alerta disparado para ${enviados} operacional(is)!`, enviados });
    } catch (e) {
        res.status(500).json({ success: false, message: 'Erro ao disparar ação: ' + e.message });
    }
});

app.put('/api/membro/status-plantao', async (req, res) => {
    try {
        const { nickname, emPlantao, estadoTurno, inicioPlantao, segundosAcumulados, fotoComprovanteAtiva } = req.body;
        if (!nickname) return res.status(400).json({ success: false, message: 'Nickname obrigatório.' });

        if (emPlantao) {
            const agoraBrasilStr = new Date().toLocaleString("en-US", { timeZone: "America/Sao_Paulo" });
            const agoraBrasil = new Date(agoraBrasilStr);
            const hora = agoraBrasil.getHours();

            const membroUser = await User.findOne({ nickname: new RegExp('^' + nickname + '$', 'i') }).lean();
            const cargo = membroUser ? (membroUser.cargo || '') : '';
            const ehMestre = nickname.toLowerCase().trim() === 'mestre' || cargo === 'General' || cargo === 'Coronel All';

            if (!ehMestre && !(hora >= 17 || hora < 2)) {
                return res.status(400).json({ 
                    success: false, 
                    message: 'Plantões só podem ser iniciados a partir das 17:00 até às 02:00 da madrugada!' 
                });
            }
        }

        const updateData = {
            emPlantao: !!emPlantao,
            estadoTurno: estadoTurno || 'parado'
        };

        if (inicioPlantao !== undefined) updateData.inicioPlantao = inicioPlantao ? new Date(inicioPlantao) : null;
        if (segundosAcumulados !== undefined) updateData.segundosAcumulados = segundosAcumulados;
        if (fotoComprovanteAtiva !== undefined) updateData.fotoComprovanteAtiva = fotoComprovanteAtiva;

        await User.updateOne({ nickname: new RegExp('^' + nickname + '$', 'i') }, { $set: updateData });

        io.emit('atualizar_estado_turno_usuario', { nickname: nickname.toLowerCase() });
        io.emit('atualizar_status_geral_tropa');

        res.json({ success: true, message: 'Estado do turno sincronizado com sucesso!' });
    } catch (e) {
        res.status(500).json({ success: false, message: 'Erro ao atualizar status na conta.' });
    }
});

app.post('/api/membro/turno', async (req, res) => {
    try {
        const { nickname, duracao, segundosTotais, fotoComprovante } = req.body;
        if (!nickname) return res.status(400).json({ success: false, message: 'Nickname não fornecido.' });

        const membroDoc = await User.findOne({ nickname: new RegExp('^' + nickname + '$', 'i') });
        if (!membroDoc) return res.status(404).json({ success: false, message: 'Membro não encontrado.' });

        let segundosFinais = parseInt(segundosTotais) || 0;
        if (segundosFinais <= 0 && duracao) {
            segundosFinais = converterDuracaoParaSegundos(duracao);
        }

        if (membroDoc.inicioPlantao) {
            const segundosCalculadosValidos = calcularSegundosValidosNoHorario(membroDoc.inicioPlantao, Date.now());
            if (segundosCalculadosValidos > 0 && segundosCalculadosValidos < segundosFinais) {
                segundosFinais = segundosCalculadosValidos;
            }
        }

        if (segundosFinais < 5) {
            return res.status(400).json({ success: false, message: 'Turno muito curto ou fora do horário permitido para ser registado.' });
        }

        const duracaoFormatada = converterSegundosParaDuracao(segundosFinais);

        const novoTurno = {
            data: new Date(),
            duracao: duracaoFormatada,
            fotoComprovante: fotoComprovante || 'Sem foto'
        };

        await User.updateOne(
            { _id: membroDoc._id },
            { 
                $push: { historicoTurnos: novoTurno }, 
                $set: { 
                    emPlantao: false, 
                    estadoTurno: 'parado',
                    inicioPlantao: null,
                    segundosAcumulados: 0,
                    fotoComprovanteAtiva: ''
                } 
            }
        );

        io.emit('atualizar_estado_turno_usuario', { nickname: nickname.toLowerCase() });
        io.emit('atualizar_status_geral_tropa');
        await registarLogAdmin(nickname, 'Registo de Turno', `Turno de duração ${duracaoFormatada} concluído e registado.`);

        res.json({ success: true, message: 'Turno validado e registado com sucesso!' });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Erro ao guardar turno.' });
    }
});

app.get('/api/membro/carteira/:nickname', async (req, res) => {
    try {
        const { nickname } = req.params;
        const membro = await User.findOne({ nickname: new RegExp(`^${nickname}$`, 'i') });
        
        if (!membro) {
            return res.json({ success: false, message: 'Membro não encontrado.' });
        }

        const cicloAtual = obterDataCicloBrasil();

        if (membro.ultimoCicloMissoes !== cicloAtual) {
            membro.missoesConcluidasCiclo = [];
            membro.ultimoCicloMissoes = cicloAtual;
            await membro.save();
        }

        res.json({
            success: true,
            saldo: membro.carteiraSaldo !== undefined ? membro.carteiraSaldo : 0,
            missoes: membro.missoesConcluidasCiclo || []
        });
    } catch (error) {
        console.error("Erro ao carregar carteira:", error);
        res.status(500).json({ success: false, message: 'Erro ao carregar carteira.' });
    }
});

app.post('/api/membro/carteira/atualizar', async (req, res) => {
    try {
        const { nickname, saldoTotal, motivo, ciclo, comprovantePrint } = req.body;
        if (!nickname) return res.status(400).json({ success: false, message: 'Nickname obrigatório.' });

        const membro = await User.findOne({ nickname: new RegExp('^' + nickname.trim() + '$', 'i') });
        if (!membro) return res.status(404).json({ success: false, message: 'Membro não encontrado.' });

        const saldoFinal = saldoTotal !== undefined ? Number(saldoTotal) : (membro.carteiraSaldo || 0);
        const cicloAtualBrasil = obterDataCicloBrasil();

        membro.carteiraSaldo = saldoFinal;
        membro.ultimoCicloMissoes = cicloAtualBrasil;

        if (!membro.missoesConcluidasCiclo) {
            membro.missoesConcluidasCiclo = [];
        }

        membro.missoesConcluidasCiclo.push({
            ciclo: ciclo || cicloAtualBrasil,
            concluida: true
        });

        if (comprovantePrint) {
            membro.historicoMissoes = membro.historicoMissoes || [];
            membro.historicoMissoes.push({
                data: new Date(),
                ciclo: ciclo || cicloAtualBrasil,
                motivo: motivo || 'Missão Diária',
                comprovante: comprovantePrint
            });
        }

        await membro.save();

        await registarLogAdmin(
            nickname, 
            'Missão Diária Concluída', 
            `Completou missão no ciclo ${ciclo || cicloAtualBrasil}. Novo Saldo na Carteira: R$ ${saldoFinal.toLocaleString('pt-BR')}`
        );

        res.json({ success: true, message: 'Carteira atualizada com sucesso!', saldo: saldoFinal });
    } catch (e) {
        console.error("Erro ao atualizar carteira/missão:", e);
        res.status(500).json({ success: false, message: 'Erro ao atualizar carteira.' });
    }
});

app.get('/api/admin/membro/missoes/:id', async (req, res) => {
    try {
        const { id } = req.params;
        let query = { _id: id };
        if (!id.match(/^[0-9a-fA-F]{24}$/)) {
            query = { nickname: new RegExp('^' + decodeURIComponent(id) + '$', 'i') };
        }

        const membro = await User.findOne(query, 'nickname cargo historicoMissoes missoesDiarias carteiraSaldo').lean();
        if (!membro) return res.status(404).json({ success: false, message: 'Membro não encontrado.' });

        let listaMissoes = membro.historicoMissoes || [];
        if (listaMissoes.length === 0 && membro.missoesDiarias) {
            membro.missoesDiarias.forEach(m => {
                if (m.fotoComprovante || m.comprovante) {
                    listaMissoes.push({
                        data: m.data || new Date(),
                        ciclo: 'Atual',
                        motivo: m.titulo || 'Missão Concluída',
                        comprovante: m.fotoComprovante || m.comprovante
                    });
                }
            });
        }

        res.json({
            success: true,
            nickname: membro.nickname,
            cargo: membro.cargo,
            saldo: membro.carteiraSaldo !== undefined ? membro.carteiraSaldo : 0,
            historicoMissoes: listaMissoes
        });
    } catch (e) {
        res.status(500).json({ success: false, message: 'Erro ao carregar histórico de missões.' });
    }
});

app.get('/api/admin/membro/historico-completo/:id', async (req, res) => {
    try {
        const { id } = req.params;
        let query = { _id: id };
        if (!id.match(/^[0-9a-fA-F]{24}$/)) {
            query = { nickname: new RegExp('^' + decodeURIComponent(id) + '$', 'i') };
        }

        const membro = await User.findOne(query, 'nickname cargo status historicoTurnos carteiraSaldo').lean();
        if (!membro) return res.status(404).json({ success: false, message: 'Membro não encontrado.' });

        res.json({
            success: true,
            nickname: membro.nickname,
            cargo: membro.cargo,
            status: membro.status || 'Ativo',
            historicoTurnos: membro.historicoTurnos || []
        });
    } catch (e) {
        res.status(500).json({ success: false, message: 'Erro ao carregar histórico completo de turnos.' });
    }
});

app.get(['/api/membro/em-plantao', '/api/membro/em-plantao/:nickname'], async (req, res) => {
    try {
        let nickname = req.params.nickname || req.query.nickname;
        if (!nickname) {
            const membrosAtivos = await User.find({ emPlantao: true }, 'nickname cargo inicioPlantao fotoComprovanteAtiva').lean();
            return res.json({ 
                success: true, 
                emPlantao: membrosAtivos, 
                emPlantaoLista: membrosAtivos 
            });
        }

        const membro = await User.findOne({ nickname: new RegExp('^' + nickname + '$', 'i') }).lean();
        if (!membro) {
            return res.json({ success: true, emPlantao: false, estadoTurno: 'parado', inicioPlantao: null, segundosAcumulados: 0 });
        }

        res.json({
            success: true,
            emPlantao: !!membro.emPlantao,
            estadoTurno: membro.estadoTurno || 'parado',
            inicioPlantao: membro.inicioPlantao || null,
            segundosAcumulados: membro.segundosAcumulados || 0,
            fotoComprovanteAtiva: membro.fotoComprovanteAtiva || ''
        });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Erro ao verificar status de plantão.' });
    }
});

app.get('/api/admin/logs', async (req, res) => {
    try {
        const logs = await LogAdmin.find().sort({ data: -1 }).limit(100).lean();
        res.json({ success: true, logs });
    } catch (e) {
        res.status(500).json({ success: false, message: 'Erro ao carregar logs.' });
    }
});

app.get('/api/admin/membro/historico/:nickname', async (req, res) => {
    try {
        const nickname = req.params.nickname;
        let query = { nickname: new RegExp('^' + decodeURIComponent(nickname) + '$', 'i') };
        if (nickname.match(/^[0-9a-fA-F]{24}$/)) {
            query = { $or: [{ nickname: new RegExp('^' + nickname + '$', 'i') }, { _id: nickname }] };
        }

        let membro = await User.findOne(query, '-password -historicoTurnos.fotoComprovante').lean();
        if (!membro) return res.status(404).json({ success: false, message: 'Membro não encontrado.' });

        const ultimoTurno = membro.historicoTurnos && membro.historicoTurnos.length > 0 ? membro.historicoTurnos[membro.historicoTurnos.length - 1] : null;

        res.json({
            success: true,
            membro: {
                nickname: membro.nickname,
                cargo: membro.cargo || 'Privado',
                status: membro.status || 'Ativo',
                ultimoPlantao: ultimoTurno ? `${ultimoTurno.duracao} (${new Date(ultimoTurno.data).toLocaleDateString()})` : 'Nenhum plantão'
            },
            historicoTurnos: membro.historicoTurnos || [],
            historicoPromocoes: membro.historicoPromocoes || [],
            historicoSorteios: membro.historicoSorteios || [],
            caixaEntrada: membro.caixaEntrada || []
        });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Erro no servidor.' });
    }
});

app.get('/api/admin/membros', async (req, res) => {
  try {
    const membros = await User.find({}, 'nickname cargo status emPlantao historicoTurnos.duracao historicoTurnos.data').lean(); 
    const membrosFormatados = membros.map(m => {
      const totalSegundosAcumulados = (m.historicoTurnos || []).reduce((acc, t) => acc + converterDuracaoParaSegundos(t.duracao), 0);
      const totalHorasFormatado = converterSegundosParaDuracao(totalSegundosAcumulados);
      
      const ultimoTurno = m.historicoTurnos && m.historicoTurnos.length > 0 ? m.historicoTurnos[m.historicoTurnos.length - 1] : null;
      return {
        _id: m._id,
        nickname: m.nickname,
        cargo: m.cargo || 'Privado',
        status: m.status || 'ativo',
        emPlantao: !!m.emPlantao,
        ultimoPlantao: totalSegundosAcumulados > 0 
          ? `Total: ${totalHorasFormatado} (${m.historicoTurnos.length} turnos)` 
          : (ultimoTurno ? `${ultimoTurno.duracao} (${new Date(ultimoTurno.data).toLocaleDateString()})` : 'Nenhum plantão registado')
      };
    });
    res.json({ success: true, membros: membrosFormatados });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Erro ao carregar efetivo.' });
  }
});

app.get('/api/admin/estatisticas', async (req, res) => {
    try {
        const totalRegistados = await User.countDocuments();
        const ativos = await User.countDocuments({ status: 'ativo' });
        const pendentes = await User.countDocuments({ status: 'pendente' });
        const emPlantao = await User.countDocuments({ emPlantao: true });

        res.json({
            success: true,
            estatisticas: { totalRegistados, ativos, pendentes, emPlantao }
        });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Erro ao carregar estatísticas.' });
    }
});

app.put('/api/admin/membro/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { status, cargo, autor } = req.body;
        const membroAntigo = await User.findById(id);
        if (!membroAntigo) return res.status(404).json({ success: false, message: 'Membro não encontrado.' });

        if (cargo && (cargo === 'Coronel' || cargo === 'Coronel All')) {
            const autorLimpo = (autor || '').toLowerCase().trim();
            if (autorLimpo !== 'mestre') {
                return res.status(403).json({ success: false, message: 'Acesso negado. Apenas a conta Mestre pode promover para Coronel ou Coronel All.' });
            }
        }

        const updateData = {};
        if (status) updateData.status = status;
        if (cargo) updateData.cargo = cargo;

        const membro = await User.findByIdAndUpdate(id, { $set: updateData }, { new: true });
        const nomeAutor = autor || 'Comando';
        
        if (cargo && cargo !== membroAntigo.cargo) {
            const acaoStr = cargoAniPrecedencia(cargo, membroAntigo.cargo) ? 'Promoção de Cargo' : 'Alteração / Rebaixamento de Cargo';
            await User.updateOne({ _id: id }, { $push: { historicoPromocoes: { novoCargo: cargo, cargoAnterior: membroAntigo.cargo, data: new Date() } } });
            await registarLogAdmin(nomeAutor, acaoStr, `Membro ${membro.nickname} alterado de ${membroAntigo.cargo} para ${cargo}`);
        }

        if (status && status !== membroAntigo.status) {
            await registarLogAdmin(nomeAutor, 'Alteração de Status', `Membro ${membro.nickname} alterou status para ${status}`);
        }

        if (cargo) {
            io.emit('atualizar_cargo_usuario', { nickname: membro.nickname.toLowerCase(), novoCargo: cargo });
        }

        io.emit('atualizar_status_geral_tropa');
        res.json({ success: true, message: 'Membro atualizado com sucesso!', membro });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Erro ao atualizar membro.' });
    }
});

function cargoAniPrecedencia(novo, antigo) {
    const hierarquia = ['Privado', 'Soldado', 'Sargento', 'Tenente', 'Major', 'Coronel', 'Coronel All', 'General'];
    return hierarquia.indexOf(novo) > hierarquia.indexOf(antigo);
}

app.put('/api/admin/membro/forcar-fim-turno/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const membro = await User.findById(id);
        if (!membro) return res.status(404).json({ success: false, message: 'Membro não encontrado.' });

        await User.updateOne(
            { _id: id },
            { 
                $set: { 
                    emPlantao: false, 
                    estadoTurno: 'parado',
                    inicioPlantao: null,
                    segundosAcumulados: 0,
                    fotoComprovanteAtiva: ''
                } 
            }
        );

        io.emit('atualizar_estado_turno_usuario', { nickname: membro.nickname.toLowerCase() });
        io.emit('atualizar_status_geral_tropa');
        await registarLogAdmin('Comando', 'Fim de Turno Forçado', `Turno de ${membro.nickname} encerrado à força pelo Comando.`);

        res.json({ success: true, message: `Turno de ${membro.nickname} encerrado à força com sucesso!` });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Erro ao forçar fim de turno.' });
    }
});

app.put('/api/admin/membro/resetar-turnos/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const membro = await User.findByIdAndUpdate(id, { $set: { historicoTurnos: [] } }, { new: true });
        if (!membro) return res.status(404).json({ success: false, message: 'Membro não encontrado.' });
        io.emit('atualizar_status_geral_tropa');
        await registarLogAdmin('Comando', 'Reset de Turnos', `Histórico de turnos de ${membro.nickname} foi limpo.`);
        res.json({ success: true, message: 'Turnos resetados com sucesso!' });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Erro ao resetar turnos.' });
    }
});

app.delete('/api/admin/membro/:id/turno/:turnoId', async (req, res) => {
    try {
        const { id, turnoId } = req.params;
        const membro = await User.findById(id);
        if (!membro) return res.status(404).json({ success: false, message: 'Membro não encontrado.' });

        membro.historicoTurnos = membro.historicoTurnos.filter(t => t._id.toString() !== turnoId);
        await membro.save();

        io.emit('atualizar_status_geral_tropa');
        await registarLogAdmin('Comando', 'Exclusão de Turno Específico', `Um turno foi removido do histórico de ${membro.nickname}.`);
        res.json({ success: true, message: 'Turno removido com sucesso!' });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Erro ao remover turno.' });
    }
});

app.delete('/api/admin/membro/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const membro = await User.findByIdAndDelete(id);
        if (!membro) return res.status(404).json({ success: false, message: 'Membro não encontrado.' });
        io.emit('atualizar_status_geral_tropa');
        await registarLogAdmin('Comando', 'Demissão / Exclusão', `Membro ${membro.nickname} foi demitido/removido.`);
        res.json({ success: true, message: 'Membro demitido/removido com sucesso!' });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Erro ao remover membro.' });
    }
});

// --- ROTA DE RANKING ULTRA-OTIMIZADA (EXPRESS) ---
app.get('/api/admin/ranking/turnos', async (req, res) => {
    try {
        const configRanking = await ConfigSorteio.collection.findOne({ chave: 'config_ranking_semanal' });
        const dataCorte = configRanking && configRanking.dataUltimoReset ? new Date(configRanking.dataUltimoReset) : null;

        // Otimização extrema: traz apenas os campos estritamente necessários e usa lean()
        const membros = await User.find({}, 'nickname cargo historicoTurnos.duracao historicoTurnos.data historicoTurnos.fotoComprovante').lean();
        
        const ranking = membros.map(m => {
            const turnosValidos = (m.historicoTurnos || []).filter(t => {
                const dTurno = new Date(t.data);
                if (dataCorte && dTurno <= dataCorte) return false;
                return turnoEstaNoHorarioPermitido(t);
            });

            const totalSegundos = turnosValidos.reduce((acc, t) => acc + converterDuracaoParaSegundos(t.duracao), 0);
            return {
                nickname: m.nickname,
                cargo: m.cargo || 'Privado',
                totalSegundos: totalSegundos,
                totalFormatado: converterSegundosParaDuracao(totalSegundos)
            };
        }).filter(m => m.totalSegundos > 0).sort((a, b) => b.totalSegundos - a.totalSegundos);

        res.json({ success: true, ranking: ranking.slice(0, 10) });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Erro ao carregar ranking de turnos.' });
    }
});

app.put('/api/admin/ranking/resetar', async (req, res) => {
    try {
        const dataAtualReset = new Date();
        
        await ConfigSorteio.collection.updateOne(
            { chave: 'config_ranking_semanal' },
            { $set: { chave: 'config_ranking_semanal', dataUltimoReset: dataAtualReset } },
            { upsert: true }
        );

        const notif = {
            titulo: '🔄 Ranking Semanal Resetado',
            mensagem: 'O comando iniciou um novo ciclo semanal no ranking. O seu histórico pessoal de horas continua guardado no perfil!',
            data: dataAtualReset
        };
        
        await User.updateMany({}, { $push: { caixaEntrada: notif } });
        io.emit('atualizar_status_geral_tropa');
        
        await registarLogAdmin('Comando', 'Reset de Ranking', 'Novo ciclo semanal iniciado (histórico preservado com data de corte).');
        res.json({ success: true, message: 'Ranking semanal resetado com sucesso! O histórico dos membros foi preservado.' });
    } catch (e) {
        res.status(500).json({ success: false, message: 'Erro ao resetar ranking.' });
    }
});

app.post('/api/admin/notificar/ranking', async (req, res) => {
    try {
        const notif = {
            titulo: '📊 Posição do Ranking',
            mensagem: 'O comando atualizou as notificações relativas ao ranking semanal de horas.',
            data: new Date()
        };
        await User.updateMany({}, { $push: { caixaEntrada: notif } });
        res.json({ success: true, message: 'Notificações enviadas!' });
    } catch (e) {
        res.status(500).json({ success: false, message: 'Erro ao enviar notificações.' });
    }
});

app.post('/api/admin/mestre/adicionar-tempo', async (req, res) => {
    try {
        const { adminNickname, targetNickname, horas, minutos, segundos, motivo } = req.body;

        if (!adminNickname || adminNickname.toLowerCase().trim() !== 'mestre') {
            return res.status(403).json({ success: false, message: 'Acesso negado. Apenas a conta Mestre pode injetar tempo.' });
        }
        if (!targetNickname) {
            return res.status(400).json({ success: false, message: 'Nickname do membro alvo é obrigatório.' });
        }

        const h = parseInt(horas) || 0;
        const m = parseInt(minutos) || 0;
        const s = parseInt(segundos) || 0;
        const totalSegundos = (h * 3600) + (m * 60) + s;

        if (totalSegundos <= 0) {
            return res.status(400).json({ success: false, message: 'O tempo a adicionar deve ser superior a 0.' });
        }

        const duracaoFormatada = converterSegundosParaDuracao(totalSegundos);
        const dataInjecao = new Date();

        const novoTurnoManual = {
            data: dataInjecao,
            duracao: duracaoFormatada,
            fotoComprovante: motivo ? `Injeção Manual por Mestre: ${motivo}` : 'Injeção Manual por Mestre'
        };

        const notif = {
            titulo: '⏱️ Tempo Adicionado Manualmente',
            mensagem: `O Comando (Mestre) adicionou ${duracaoFormatada} ao teu histórico. Motivo: ${motivo || 'Ajuste operacional'}.`,
            data: new Date()
        };

        const resultado = await User.updateOne(
            { nickname: new RegExp('^' + targetNickname.trim() + '$', 'i') },
            { $push: { historicoTurnos: novoTurnoManual, caixaEntrada: notif } }
        );

        if (resultado.matchedCount === 0) return res.status(404).json({ success: false, message: 'Membro alvo não encontrado.' });

        io.emit('atualizar_status_geral_tropa');
        await registarLogAdmin(adminNickname, 'Injeção Manual de Tempo', `Adicionado ${duracaoFormatada} para ${targetNickname}. Motivo: ${motivo}`);
        res.json({ success: true, message: `Adicionado com sucesso ${duracaoFormatada} para ${targetNickname}!` });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Erro interno ao adicionar tempo: ' + error.message });
    }
});

app.get('/api/membro/provas/status/:nickname', async (req, res) => {
    try {
        const membro = await User.findOne({ nickname: new RegExp('^' + req.params.nickname + '$', 'i') }).lean();
        if (!membro) return res.status(404).json({ success: false, message: 'Membro não encontrado.' });

        if (membro.cooldownProvaAte) {
            const dataCooldown = new Date(membro.cooldownProvaAte);
            const agora = new Date();
            if (agora < dataCooldown) {
                const horasRestantes = Math.ceil((dataCooldown - agora) / (1000 * 60 * 60));
                return res.json({ success: true, bloqueadoPorCooldown: true, horasRestantes });
            }
        }

        const turnosValidos = (membro.historicoTurnos || []).filter(t => turnoEstaNoHorarioPermitido(t));
        const totalSegundos = turnosValidos.reduce((acc, t) => acc + converterDuracaoParaSegundos(t.duracao), 0);
        const totalHoras = totalSegundos / 3600;

        const cargoAtual = membro.cargo || 'Privado';
        let provaDisponivelPara = null;
        let horasNecessarias = 0;

        if (cargoAtual === 'Soldado' || cargoAtual === 'Privado') {
            horasNecessarias = 10;
            if (totalHoras >= 10) provaDisponivelPara = 'Sargento';
        } else if (cargoAtual === 'Sargento') {
            horasNecessarias = 25;
            if (totalHoras >= 25) provaDisponivelPara = 'Tenente';
        } else if (cargoAtual === 'Tenente') {
            horasNecessarias = 50;
            if (totalHoras >= 50) provaDisponivelPara = 'Major';
        }

        const horasFaltando = Math.max(0, (horasNecessarias - totalHoras).toFixed(1));
        res.json({ success: true, bloqueadoPorCooldown: false, totalHoras: totalHoras.toFixed(1), cargoAtual, provaDisponivelPara, horasFaltando });
    } catch (e) {
        res.status(500).json({ success: false, message: 'Erro ao verificar status de provas.' });
    }
});

app.post('/api/membro/provas/submeter', async (req, res) => {
    try {
        const { nickname, cargoAlvo, respostas } = req.body;
        const membro = await User.findOne({ nickname: new RegExp('^' + nickname + '$', 'i') });
        if (!membro) return res.status(404).json({ success: false, message: 'Membro não encontrado.' });

        let gabarito = { q1: 'a', q2: 'b', q3: 'b' };
        let acertos = 0;
        let totalPerguntas = 3;

        if (respostas && respostas.q1 === gabarito.q1) acertos++;
        if (respostas && respostas.q2 === gabarito.q2) acertos++;
        if (respostas && respostas.q3 === gabarito.q3) acertos++;

        const aprovado = (acertos / totalPerguntas) >= 0.7;

        if (aprovado) {
            await User.updateOne(
                { _id: membro._id },
                { 
                    $set: { cargo: cargoAlvo, cooldownProvaAte: null },
                    $push: { 
                        historicoPromocoes: { novoCargo: cargoAlvo, cargoAnterior: membro.cargo, data: new Date() },
                        caixaEntrada: {
                            titulo: '🎉 Aprovado na Prova!',
                            mensagem: `Parabéns! Foste aprovado na prova e promovido para <b>${cargoAlvo}</b>!`,
                            data: new Date()
                        }
                    }
                }
            );
            io.emit('atualizar_status_geral_tropa');
            io.emit('atualizar_cargo_usuario', { nickname: nickname.toLowerCase(), novoCargo: cargoAlvo });
            await registarLogAdmin(nickname, 'Aprovação em Exame', `Membro aprovado em exame e promovido a ${cargoAlvo}.`);
            res.json({ success: true, aprovado: true, message: `Parabéns! Passaste na prova e foste promovido a ${cargoAlvo}!` });
        } else {
            const dataCooldown = new Date();
            dataCooldown.setHours(dataCooldown.getHours() + 24);
            await User.updateOne({ _id: membro._id }, { $set: { cooldownProvaAte: dataCooldown } });
            await registarLogAdmin(nickname, 'Reprovação em Exame', `Membro reprovado no exame para ${cargoAlvo}.`);
            res.json({ success: true, aprovado: false, message: `Infelizmente obtiviste ${acertos}/${totalPerguntas} acertos. Cooldown de 24h ativado.` });
        }
    } catch (e) {
        res.status(500).json({ success: false, message: 'Erro interno ao processar prova.' });
    }
});

async function obterConfigSorteio() {
    let config = await ConfigSorteio.collection.findOne({ chave: 'sorteio_ativo' });
    if (!config) {
        await ConfigSorteio.collection.updateOne(
            { chave: 'sorteio_ativo' },
            { $set: { chave: 'sorteio_ativo', ganhadoresCiclo: [], dataUltimoReset: null } },
            { upsert: true }
        );
        return { chave: 'sorteio_ativo', ganhadoresCiclo: [], dataUltimoReset: null };
    }
    return config;
}

app.get('/api/admin/sorteio/status', async (req, res) => {
    try {
        const config = await obterConfigSorteio();
        res.json({ success: true, agendamento: null, ganhadoresCiclo: config.ganhadoresCiclo || [] });
    } catch (e) {
        res.json({ success: true, agendamento: null, ganhadoresCiclo: [] });
    }
});

app.get('/api/admin/sorteio/elegiveis', async (req, res) => {
  try {
    const config = await obterConfigSorteio();
    const ganhadoresCiclo = config.ganhadoresCiclo || [];
    const dataCorte = config.dataUltimoReset ? new Date(config.dataUltimoReset) : null;

    const membros = await User.find({}, 'nickname cargo historicoTurnos.duracao historicoTurnos.data historicoTurnos.fotoComprovante').lean();
    const elegiveis = membros.filter(m => {
      if (!m.historicoTurnos || m.historicoTurnos.length === 0) return false;
      
      const nicknameLower = m.nickname.toLowerCase().trim();
      if (ganhadoresCiclo.includes(nicknameLower)) return false;

      const turnosValidos = m.historicoTurnos.filter(t => {
          const dTurno = new Date(t.data);
          if (dataCorte && dTurno <= dataCorte) return false;
          return turnoEstaNoHorarioPermitido(t) && turnoPertenceAoCicloAtual(t);
      });

      const totalSegundos = turnosValidos.reduce((acc, t) => acc + converterDuracaoParaSegundos(t.duracao), 0);
      return totalSegundos >= 7200;
    });

    res.json({ success: true, elegiveis: elegiveis.map(m => ({ id: m._id, nickname: m.nickname, cargo: m.cargo || 'Privado' })) });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Erro ao carregar elegíveis.' });
  }
});

async function executarResetCiclo(req, res) {
    try {
        await ConfigSorteio.collection.updateOne(
            { chave: 'sorteio_ativo' },
            { $set: { chave: 'sorteio_ativo', ganhadoresCiclo: [], dataUltimoReset: new Date() } },
            { upsert: true }
        );
        io.emit('atualizar_status_geral_tropa');
        await registarLogAdmin('Comando', 'Reset de Elegíveis', 'Lista de elegíveis zerada.');
        res.json({ success: true, message: 'Elegíveis resetados com sucesso! A lista foi limpa.' });
    } catch (e) {
        res.status(500).json({ success: false, message: 'Erro ao resetar elegíveis.' });
    }
}

app.post('/api/admin/sorteio/resetar-ciclo', executarResetCiclo);
app.post('/api/admin/sorteio/resetar-elegiveis', executarResetCiclo);

app.post('/api/admin/sorteio/realizar', async (req, res) => {
  try {
    const { premios } = req.body;
    const config = await obterConfigSorteio();
    const ganhadoresCiclo = config.ganhadoresCiclo || [];
    const dataCorte = config.dataUltimoReset ? new Date(config.dataUltimoReset) : null;

    const membros = await User.find({}, 'nickname cargo historicoTurnos.duracao historicoTurnos.data historicoTurnos.fotoComprovante').lean();
    
    const elegiveis = membros.filter(m => {
      const nicknameLower = m.nickname.toLowerCase().trim();
      if (ganhadoresCiclo.includes(nicknameLower)) return false;

      const turnosValidos = (m.historicoTurnos || []).filter(t => {
          const dTurno = new Date(t.data);
          if (dataCorte && dTurno <= dataCorte) return false;
          return turnoEstaNoHorarioPermitido(t) && turnoPertenceAoCicloAtual(t);
      });

      return turnosValidos.reduce((acc, t) => acc + converterDuracaoParaSegundos(t.duracao), 0) >= 7200;
    });

    if (elegiveis.length === 0) {
        return res.json({ success: false, message: 'Não há elegíveis disponíveis no momento.' });
    }

    const premiosLista = premios ? premios.split(',').map(p => p.trim()).filter(Boolean) : ['Prêmio Oficial'];
    const premioSorteado = premiosLista[0] || 'Prêmio Oficial';

    const indiceVencedor = Math.floor(Math.random() * elegiveis.length);
    const vencedor = elegiveis[indiceVencedor];
    const vencedorLower = vencedor.nickname.toLowerCase().trim();

    await ConfigSorteio.collection.updateOne(
        { chave: 'sorteio_ativo' },
        { $addToSet: { ganhadoresCiclo: vencedorLower } },
        { upsert: true }
    );

    const participantesNomes = elegiveis.map(e => e.nickname);

    await User.updateOne(
        { _id: vencedor._id },
        {
            $push: {
                historicoSorteios: { premio: premioSorteado, data: new Date() },
                caixaEntrada: {
                    titulo: '🏆 Vencedor da Roleta Oficial!',
                    mensagem: `Parabéns! Foste sorteado na roleta ao vivo e ganhaste: <b>${premioSorteado}</b>!`,
                    data: new Date()
                }
            }
        }
    );

    io.emit('girar_roleta_ao_vivo', {
        participantes: participantesNomes,
        vencedor: vencedor.nickname,
        cargoVencedor: vencedor.cargo || 'Privado',
        indiceVencedor: indiceVencedor,
        premio: premioSorteado
    });

    await registarLogAdmin('Comando', 'Giro da Roleta Oficial', `Vencedor: ${vencedor.nickname} | Prêmio: ${premioSorteado}`);
    
    res.json({ 
        success: true, 
        ganhadores: [{ nickname: vencedor.nickname, cargo: vencedor.cargo, premio: premioSorteado }] 
    });
  } catch (e) {
        res.status(500).json({ success: false, message: 'Erro ao realizar sorteio na roleta: ' + e.message });
  }
});

app.get('/api/admin/sorteio/elegiveis-um-turno', async (req, res) => {
  try {
    const config = await obterConfigSorteio();
    const ganhadoresCiclo = config.ganhadoresCiclo || [];

    const membros = await User.find({}, 'nickname cargo historicoTurnos.data historicoTurnos.fotoComprovante').lean();
    const elegiveis = membros.filter(m => {
      if (!m.historicoTurnos || m.historicoTurnos.length === 0) return false;

      const nicknameLower = m.nickname.toLowerCase().trim();
      if (ganhadoresCiclo.includes(nicknameLower)) return false;

      return m.historicoTurnos.some(t => turnoPertenceAoCicloAtual(t));
    });

    res.json({ success: true, elegiveis: elegiveis.map(m => ({ id: m._id, nickname: m.nickname, cargo: m.cargo || 'Privado' })) });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Erro ao carregar elegíveis de 1 turno.' });
  }
});

app.post('/api/admin/sorteio/realizar-um-turno', async (req, res) => {
  try {
    const { premios } = req.body;
    const config = await obterConfigSorteio();
    const ganhadoresCiclo = config.ganhadoresCiclo || [];

    const membros = await User.find({}, 'nickname cargo historicoTurnos.data historicoTurnos.fotoComprovante').lean();
    
    const elegiveis = membros.filter(m => {
      if (!m.historicoTurnos || m.historicoTurnos.length === 0) return false;
      
      const nicknameLower = m.nickname.toLowerCase().trim();
      if (ganhadoresCiclo.includes(nicknameLower)) return false;

      return m.historicoTurnos.some(t => turnoPertenceAoCicloAtual(t));
    });

    if (elegiveis.length === 0) {
        return res.json({ success: false, message: 'Não há operacionais elegíveis (com turnos hoje e que ainda não ganharam) disponíveis no momento.' });
    }

    const premiosLista = premios ? premios.split(',').map(p => p.trim()).filter(Boolean) : ['Prêmio Oficial'];
    const premioSorteado = premiosLista[0] || 'Prêmio Oficial';

    const indiceVencedor = Math.floor(Math.random() * elegiveis.length);
    const vencedor = elegiveis[indiceVencedor];
    const vencedorLower = vencedor.nickname.toLowerCase().trim();

    await ConfigSorteio.collection.updateOne(
        { chave: 'sorteio_ativo' },
        { $addToSet: { ganhadoresCiclo: vencedorLower } },
        { upsert: true }
    );

    await User.updateOne(
        { _id: vencedor._id },
        {
            $push: {
                historicoSorteios: { premio: premioSorteado, data: new Date() },
                caixaEntrada: {
                    titulo: '🏆 Vencedor da Roleta (1 Turno Hoje)!',
                    mensagem: `Parabéns! Foste sorteado na roleta diária de 1 turno e ganhaste: <b>${premioSorteado}</b>!`,
                    data: new Date()
                }
            }
        }
    );

    await registarLogAdmin('Comando', 'Giro Roleta 1 Turno Hoje', `Vencedor: ${vencedor.nickname} | Prêmio: ${premioSorteado}`);
    
    res.json({ 
        success: true, 
        ganhadores: [{ nickname: vencedor.nickname, cargo: vencedor.cargo, premio: premioSorteado }] 
    });
  } catch (e) {
        res.status(500).json({ success: false, message: 'Erro ao realizar sorteio: ' + e.message });
  }
});

const usuariosOnline = {}; 
io.on('connection', (socket) => {
  socket.on('entrar_sala', (data) => {
    let salaId = typeof data === 'string' ? data : (data.salaId || 'sala_geral_salazar');
    let nickname = typeof data === 'string' ? 'Operacional' : (data.nickname || 'Operacional');
    let cargo = typeof data === 'string' ? 'Privado' : (data.cargo || 'Privado');

    socket.join(salaId);
    usuariosOnline[socket.id] = { nickname, cargo, salaId };
    atualizarEstadoOperacional(salaId);
  });

  socket.on('chat_mensagem', (data) => { io.to(data.salaId).emit('receber_mensagem', data); });

  socket.on('disconnect', () => {
    const user = usuariosOnline[socket.id];
    if (user) {
      delete usuariosOnline[socket.id];
      atualizarEstadoOperacional(user.salaId);
    }
  });
});

function atualizarEstadoOperacional(salaId) {
  const conexõesNaSala = Object.values(usuariosOnline).filter(u => u.salaId === salaId);
  const unicosMap = {};
  conexõesNaSala.forEach(u => { unicosMap[u.nickname] = u; });
  const listaFormatada = Object.values(unicosMap);
  io.to(salaId).emit('atualizar_usuarios_online', listaFormatada);
  io.emit('atualizar_status_adm', listaFormatada);
}

const PORT = process.env.PORT || 10000;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`Servidor rodando na porta ${PORT} 🚀`);
});