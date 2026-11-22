const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const dotenv = require('dotenv');
const cors = require('cors');
const webpush = require('web-push');
const path = require('path');
const conectarDB = require('./config/db');
const User = require('./models/User');
const BatePonto = require('./models/BatePonto');
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
  const partes = String(duracaoStr).split(':');
  if (partes.length !== 3) return 0;
  return (parseInt(partes[0], 10) * 3600) + (parseInt(partes[1], 10) * 60) + parseInt(partes[2], 10);
}

function converterSegundosParaDuracao(segundosTotais) {
  const segundosSeguros = Math.max(0, parseInt(segundosTotais, 10) || 0);
  const horas = String(Math.floor(segundosSeguros / 3600)).padStart(2, '0');
  const minutos = String(Math.floor((segundosSeguros % 3600) / 60)).padStart(2, '0');
  const segundos = String(segundosSeguros % 60).padStart(2, '0');
  return `${horas}:${minutos}:${segundos}`;
}

// Helper consistente para horário de Brasília (UTC-3), independente do fuso do servidor
function obterDataEmBrasil(timestamp = Date.now()) {
    return new Date(Number(timestamp) - (3 * 3600 * 1000));
}

function horaBrasiliaEstaNaJanelaTurno(dateObj) {
    const dBrasil = obterDataEmBrasil(dateObj);
    const hora = dBrasil.getUTCHours();
    const minuto = dBrasil.getUTCMinutes();
    // 17:00 às 23:59
    if (hora >= 17 && hora <= 23) return true;
    // 00:00 às 01:59
    if (hora >= 0 && hora < 2) return true;
    // Tolerância até 02:15 para turnos da Etapa 3
    if (hora === 2 && minuto <= 15) return true;
    return false;
}

function obterEtapaHorarioBrasilia(dateObj = new Date()) {
    const dBrasil = obterDataEmBrasil(dateObj);
    const hora = dBrasil.getUTCHours();
    const minuto = dBrasil.getUTCMinutes();
    // Etapa 1: 17h às 20h
    if (hora >= 17 && hora < 20) return 1;
    // Etapa 2: 20h às 23h
    if (hora >= 20 && hora < 23) return 2;
    // Etapa 3: 23h às 02h (com tolerância até 02:15)
    if (hora === 23 || hora === 0 || hora === 1 || (hora === 2 && minuto <= 15)) return 3;
    return null;
}

function obterDataCicloBrasil(timestamp = Date.now()) {
    const agoraBrasil = obterDataEmBrasil(timestamp);
    const hora = agoraBrasil.getUTCHours();
    const min = agoraBrasil.getUTCMinutes();
    // Ciclo diário de plantão vai das 17h até às 02h (com tolerância até 02:15)
    if (hora < 2 || (hora === 2 && min <= 15)) {
        agoraBrasil.setUTCDate(agoraBrasil.getUTCDate() - 1);
    }
    return agoraBrasil.toISOString().split('T')[0];
}

function calcularSegundosValidosNoHorario(inicioTimestamp, fimTimestamp) {
    const inicioMs = new Date(inicioTimestamp).getTime();
    const fimMs = new Date(fimTimestamp).getTime();
    if (isNaN(inicioMs) || isNaN(fimMs) || fimMs <= inicioMs) return 0;

    // Trabalha em timestamps UTC deslocados em -3h para alinhar exatamente às 17:00 e 02:00 de Brasília
    const offsetMs = 3 * 3600 * 1000;
    const inicioBrt = new Date(inicioMs - offsetMs);

    const janelaInicioBrt = new Date(Date.UTC(
        inicioBrt.getUTCFullYear(),
        inicioBrt.getUTCMonth(),
        inicioBrt.getUTCDate(),
        17, 0, 0, 0
    ));

    if (inicioBrt.getUTCHours() < 2 || (inicioBrt.getUTCHours() === 2 && inicioBrt.getUTCMinutes() <= 15)) {
        janelaInicioBrt.setUTCDate(janelaInicioBrt.getUTCDate() - 1);
    }

    const janelaFimBrt = new Date(janelaInicioBrt.getTime() + (9 * 3600 * 1000) + (15 * 60 * 1000)); // 17:00 até 02:15 (+9h15m)

    const janelaInicioRealMs = janelaInicioBrt.getTime() + offsetMs;
    const janelaFimRealMs = janelaFimBrt.getTime() + offsetMs;

    const inicioValido = Math.max(inicioMs, janelaInicioRealMs);
    const fimValido = Math.min(fimMs, janelaFimRealMs);

    if (fimValido <= inicioValido) return 0;

    return Math.floor((fimValido - inicioValido) / 1000);
}

function turnoEstaNoHorarioPermitido(t) {
    if (!t) return false;
    if (t.manual === true) return true;
    if (!t.data) return false;

    const d = new Date(t.data);
    if (isNaN(d.getTime())) return false;

    return horaBrasiliaEstaNaJanelaTurno(d);
}

function turnoPertenceAoCicloAtual(t) {
    if (!t) return false;
    if (t.manual === true) return true;
    if (!t.data) return false;

    const d = new Date(t.data);
    if (isNaN(d.getTime())) return false;

    const cicloAtual = obterDataCicloBrasil(Date.now());
    const cicloTurno = obterDataCicloBrasil(d.getTime());

    return cicloTurno === cicloAtual;
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

// --- VERIFICAÇÃO AUTOMÁTICA DE FECHO DE TURNO ÀS 02:05 (BRASÍLIA) ---
async function verificarFechamentoAutomaticoTurnos() {
    try {
        const agoraBrasil = obterDataEmBrasil(Date.now());
        const hora = agoraBrasil.getUTCHours();
        const minuto = agoraBrasil.getUTCMinutes();

        if (hora === 2 && minuto >= 5 && minuto <= 7) {
            const membrosEmPlantao = await User.find({ emPlantao: true }, 'nickname cargo segundosAcumulados inicioPlantao fotoComprovanteAtiva');

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
                    const comprovanteFinal = membro.fotoComprovanteAtiva || 'Fechamento Automático (Limite 02:05)';
                    const novoTurno = {
                        data: new Date(),
                        duracao: duracaoFormatada,
                        fotoComprovante: comprovanteFinal
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

                    // Regista o fechamento no modelo BatePonto (Etapa 3)
                    const dataCiclo = obterDataCicloBrasil();
                    await BatePonto.findOneAndUpdate(
                        { usuario: membro._id, data: dataCiclo, etapa: 3 },
                        {
                            $set: {
                                nickname: membro.nickname,
                                status: 'presente',
                                duracao: duracaoFormatada,
                                segundosTotais: segundosTotais,
                                fotoComprovante: comprovanteFinal,
                                dataRegistro: new Date()
                            }
                        },
                        { upsert: true, new: true }
                    );

                    io.emit('atualizar_estado_turno_usuario', { nickname: membro.nickname.toLowerCase() });
                    await registarLogAdmin(membro.nickname, 'Fechamento Automático', `Turno encerrado às 02:05. Duração salva: ${duracaoFormatada}`);
                }
            }
            if (membrosEmPlantao.length > 0) {
                io.emit('atualizar_status_geral_tropa');
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

        const membros = await User.find({ status: 'ativo' }, 'nickname historicoTurnos.data caixaEntrada').lean();
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

// --- ROTA DEDICADA PARA MEMBROS INATIVOS (+3 DIAS) ---
app.get('/api/admin/membros-inativos', async (req, res) => {
    try {
        const agora = new Date();
        const tresDiasAtras = new Date(agora.getTime() - (3 * 24 * 60 * 60 * 1000));

        const membros = await User.find({ status: 'ativo' }, 'nickname cargo historicoTurnos.data').lean();
        const inativos = [];

        for (const m of membros) {
            const turnos = m.historicoTurnos || [];
            let ultimoTurnoData = m._id.getTimestamp();

            if (turnos.length > 0) {
                const ultimo = turnos[turnos.length - 1];
                if (ultimo.data) ultimoTurnoData = new Date(ultimo.data);
            }

            if (ultimoTurnoData < tresDiasAtras) {
                const diasAusente = Math.floor(Math.abs(agora - ultimoTurnoData) / (1000 * 60 * 60 * 24));
                inativos.push({
                    _id: m._id,
                    nickname: m.nickname,
                    cargo: m.cargo || 'Privado',
                    diasAusente: diasAusente,
                    ultimoTurno: new Date(ultimoTurnoData).toLocaleDateString()
                });
            }
        }

        res.json({ success: true, inativos });
    } catch (e) {
        res.status(500).json({ success: false, message: 'Erro ao carregar membros inativos.' });
    }
});

// --- ROTAS DE AUTENTICAÇÃO ---
app.post('/api/auth/login', async (req, res) => {
    try {
        const { nickname, senha, password } = req.body;
        const passFinal = senha || password;
        if (!nickname || !passFinal) return res.status(400).json({ success: false, message: 'Preencha os campos.' });

        const user = await User.findOne({ nickname: new RegExp('^' + nickname.trim() + '$', 'i') }, 'nickname password cargo role status').lean();
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

        const userExiste = await User.findOne({ nickname: new RegExp('^' + nickname.trim() + '$', 'i') }, '_id').lean();
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
        const membro = await User.findOne(
            { nickname: new RegExp('^' + req.params.nickname + '$', 'i') },
            'nickname cargo status avatar telefone historicoTurnos.duracao historicoTurnos.data'
        ).lean();
        if (!membro) return res.status(404).json({ success: false, message: 'Membro não encontrado.' });

        let totalSegundos = 0;
        if (membro.historicoTurnos) {
            membro.historicoTurnos.forEach(t => {
                totalSegundos += converterDuracaoParaSegundos(t.duracao);
            });
        }
        const totalHorasFormatado = converterSegundosParaDuracao(totalSegundos);

        const dataCriacao = membro._id.getTimestamp();
        const diffDias = Math.floor(Math.abs(new Date() - dataCriacao) / (1000 * 60 * 60 * 24));
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
        const membro = await User.findOne(
            { nickname: new RegExp('^' + req.params.nickname + '$', 'i') },
            'nickname cargo status emPlantao estadoTurno inicioPlantao segundosAcumulados fotoComprovanteAtiva historicoTurnos historicoPromocoes historicoSorteios caixaEntrada'
        ).lean();
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
            const adminUser = await User.findOne({ nickname: new RegExp('^' + adminNickname + '$', 'i') }, 'role cargo').lean();
            const cargoAdmin = adminUser ? (adminUser.cargo || '') : '';
            const ehAdminValido = adminUser && (adminUser.role === 'admin' || cargoAdmin === 'General' || cargoAdmin === 'Coronel All');

            if (!ehAdminValido) {
                return res.status(403).json({ success: false, message: 'Acesso negado. Apenas o Comando Superior (General ou Coronel All) pode disparar ações.' });
            }
        }

        const membrosComPush = await User.find({ pushSubscription: { $exists: true, $ne: null } }, 'pushSubscription').lean();
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

// --- ROTA DE STATUS DE PLANTÃO (CHECK-IN / PAUSA / RETOMADA) ---
app.put('/api/membro/status-plantao', async (req, res) => {
    try {
        const { nickname, emPlantao, estadoTurno, inicioPlantao, segundosAcumulados, fotoComprovanteAtiva } = req.body;
        if (!nickname) return res.status(400).json({ success: false, message: 'Nickname obrigatório.' });

        const membroAtual = await User.findOne(
            { nickname: new RegExp('^' + String(nickname).trim() + '$', 'i') },
            'emPlantao estadoTurno inicioPlantao segundosAcumulados cargo fotoComprovanteAtiva'
        );
        if (!membroAtual) return res.status(404).json({ success: false, message: 'Membro não encontrado.' });

        // Só bloqueia novo início se já estiver com plantão ativo e não for pausa/atualização
        if (emPlantao && estadoTurno === 'ativo' && membroAtual.emPlantao && membroAtual.estadoTurno === 'ativo' && !inicioPlantao) {
            return res.status(400).json({
                success: false,
                message: 'Já possui um turno ativo no momento! Termine o turno atual antes de iniciar outro.'
            });
        }

        // Ao INICIAR um plantão novo (não estava em plantão ativo), valida a janela regulamentar de Brasília (17h às 02h)
        if (emPlantao && (!membroAtual.emPlantao || membroAtual.estadoTurno === 'parado')) {
            const agoraBrasil = obterDataEmBrasil(Date.now());
            const hora = agoraBrasil.getUTCHours();
            const minuto = agoraBrasil.getUTCMinutes();
            const cargo = membroAtual.cargo || '';
            const ehMestre = String(nickname).toLowerCase().trim() === 'mestre' || cargo === 'General' || cargo === 'Coronel All';

            const dentroDoHorario = (hora >= 17 && hora <= 23) || (hora >= 0 && hora < 2) || (hora === 2 && minuto <= 15);

            if (!ehMestre && !dentroDoHorario) {
                return res.status(400).json({
                    success: false,
                    message: 'Plantões só podem ser iniciados no horário regulamentar: das 17:00 até às 02:00 da madrugada!'
                });
            }
        }

        const updateData = {
            emPlantao: !!emPlantao,
            estadoTurno: estadoTurno || (emPlantao ? 'ativo' : 'parado')
        };

        if (!emPlantao && estadoTurno === 'parado') {
            updateData.inicioPlantao = null;
            updateData.segundosAcumulados = 0;
            updateData.fotoComprovanteAtiva = '';
        } else {
            if (inicioPlantao !== undefined) {
                updateData.inicioPlantao = inicioPlantao ? new Date(inicioPlantao) : null;
            } else if (!membroAtual.inicioPlantao && updateData.estadoTurno === 'ativo') {
                updateData.inicioPlantao = new Date();
            }

            if (segundosAcumulados !== undefined) {
                updateData.segundosAcumulados = Math.max(0, parseInt(segundosAcumulados, 10) || 0);
            }

            if (fotoComprovanteAtiva !== undefined) {
                updateData.fotoComprovanteAtiva = fotoComprovanteAtiva;
            }
        }

        await User.updateOne(
            { _id: membroAtual._id },
            { $set: updateData }
        );

        io.emit('atualizar_estado_turno_usuario', { nickname: String(nickname).toLowerCase().trim() });
        io.emit('atualizar_status_geral_tropa');

        res.json({
            success: true,
            message: 'Estado do turno sincronizado com sucesso!',
            estado: updateData
        });
    } catch (e) {
        console.error("Erro ao atualizar status-plantao:", e);
        res.status(500).json({ success: false, message: 'Erro ao atualizar status na conta.' });
    }
});

// --- ROTA DE CHECK-OUT E REGISTO DE TURNO (INTEGRADA COM BATEPONTO) ---
app.post('/api/membro/turno', async (req, res) => {
    try {
        const { nickname, duracao, segundosTotais, fotoComprovante } = req.body;
        if (!nickname) return res.status(400).json({ success: false, message: 'Nickname não fornecido.' });

        const membroDoc = await User.findOne(
            { nickname: new RegExp('^' + String(nickname).trim() + '$', 'i') },
            '_id nickname cargo inicioPlantao segundosAcumulados fotoComprovanteAtiva'
        );
        if (!membroDoc) return res.status(404).json({ success: false, message: 'Membro não encontrado.' });

        let segundosFinais = parseInt(segundosTotais, 10) || 0;
        if (segundosFinais <= 0 && duracao) {
            segundosFinais = converterDuracaoParaSegundos(duracao);
        }

        if (segundosFinais <= 0) {
            let calc = Number(membroDoc.segundosAcumulados || 0);
            if (membroDoc.inicioPlantao) {
                const diff = Math.floor((Date.now() - new Date(membroDoc.inicioPlantao).getTime()) / 1000);
                if (diff > 0) calc += diff;
            }
            segundosFinais = calc;
        }

        if (segundosFinais < 5) {
            segundosFinais = 5;
        }

        const duracaoFormatada = converterSegundosParaDuracao(segundosFinais);
        const comprovanteFinal = (fotoComprovante && String(fotoComprovante).trim() !== '')
            ? fotoComprovante
            : (membroDoc.fotoComprovanteAtiva || 'Comprovante Padrão / Validado');

        const novoTurno = {
            data: new Date(),
            duracao: duracaoFormatada,
            fotoComprovante: comprovanteFinal
        };

        // 1. Atualiza no User (historicoTurnos e zera estado)
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

        // 2. Persiste e atualiza no modelo BatePonto se estiver em etapa regulamentar
        const dataInicioRef = membroDoc.inicioPlantao ? new Date(membroDoc.inicioPlantao) : new Date();
        const etapaDeterminada = obterEtapaHorarioBrasilia(dataInicioRef) || obterEtapaHorarioBrasilia(new Date()) || 1;
        const dataCiclo = obterDataCicloBrasil(dataInicioRef.getTime());

        try {
            await BatePonto.findOneAndUpdate(
                { usuario: membroDoc._id, data: dataCiclo, etapa: etapaDeterminada },
                {
                    $set: {
                        nickname: membroDoc.nickname,
                        status: 'presente',
                        duracao: duracaoFormatada,
                        segundosTotais: segundosFinais,
                        fotoComprovante: comprovanteFinal,
                        dataRegistro: new Date()
                    }
                },
                { upsert: true, new: true }
            );
        } catch (errBatePonto) {
            console.error("Aviso ao persistir no BatePonto:", errBatePonto.message);
        }

        io.emit('atualizar_estado_turno_usuario', { nickname: String(nickname).toLowerCase().trim() });
        io.emit('atualizar_status_geral_tropa');
        await registarLogAdmin(membroDoc.nickname, 'Registo de Turno', `Turno de duração ${duracaoFormatada} concluído na Etapa ${etapaDeterminada}.`);

        res.json({
            success: true,
            message: 'Turno validado e registado com sucesso!',
            turno: novoTurno,
            etapa: etapaDeterminada
        });
    } catch (error) {
        console.error("Erro ao guardar turno:", error);
        res.status(500).json({ success: false, message: 'Erro ao guardar turno: ' + error.message });
    }
});

// --- ROTAS DE GESTÃO DE CARTEIRA E MISSÕES PELO ADMIN ---
app.get('/api/admin/membro/carteira/:id', async (req, res) => {
    try {
        const { id } = req.params;
        let query = { _id: id };
        if (!id.match(/^[0-9a-fA-F]{24}$/)) {
            query = { nickname: new RegExp('^' + decodeURIComponent(id) + '$', 'i') };
        }

        const membro = await User.findOne(query, 'nickname cargo carteiraSaldo historicoMissoes').lean();
        if (!membro) return res.status(404).json({ success: false, message: 'Membro não encontrado.' });

        res.json({
            success: true,
            nickname: membro.nickname,
            cargo: membro.cargo || 'Privado',
            saldo: membro.carteiraSaldo !== undefined ? membro.carteiraSaldo : 0,
            historicoMissoes: membro.historicoMissoes || []
        });
    } catch (e) {
        res.status(500).json({ success: false, message: 'Erro ao carregar carteira do membro.' });
    }
});

app.put('/api/admin/membro/carteira/resetar/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { adminNickname } = req.body;

        const membro = await User.findById(id, 'nickname carteiraSaldo').lean();
        if (!membro) return res.status(404).json({ success: false, message: 'Membro não encontrado.' });

        const saldoPago = membro.carteiraSaldo || 0;

        await User.updateOne(
            { _id: id },
            {
                $set: { carteiraSaldo: 0 },
                $push: {
                    caixaEntrada: {
                        titulo: '💰 Pagamento Efetuado!',
                        mensagem: `O Comando efetuou o pagamento do seu saldo acumulado de <b>R$ ${saldoPago.toLocaleString('pt-BR')}</b>. A carteira foi reiniciada para R$ 0,00.`,
                        data: new Date()
                    }
                }
            }
        );

        io.emit('atualizar_status_geral_tropa');
        await registarLogAdmin(adminNickname || 'Comando', 'Pagamento de Carteira', `Efetuado pagamento de R$ ${saldoPago} para ${membro.nickname} e saldo zerado.`);

        res.json({ success: true, message: `Pagamento registado e carteira de ${membro.nickname} zerada com sucesso!` });
    } catch (e) {
        res.status(500).json({ success: false, message: 'Erro ao processar pagamento.' });
    }
});

app.get('/api/admin/config/missao-valor', async (req, res) => {
    try {
        const config = await ConfigSorteio.collection.findOne({ chave: 'valor_missao_diaria' });
        res.json({ success: true, valor: config ? config.valor : 50000 });
    } catch (e) {
        res.status(500).json({ success: false, message: 'Erro ao buscar configuração.' });
    }
});

app.post('/api/admin/config/missao-valor', async (req, res) => {
    try {
        const { adminNickname, novoValor } = req.body;
        const valorNumerico = Number(novoValor);

        if (isNaN(valorNumerico) || valorNumerico < 0) {
            return res.status(400).json({ success: false, message: 'Valor inválido.' });
        }

        await ConfigSorteio.collection.updateOne(
            { chave: 'valor_missao_diaria' },
            {
                $set: {
                    chave: 'valor_missao_diaria',
                    valor: valorNumerico,
                    atualizadoPor: adminNickname || 'Comando',
                    data: new Date()
                }
            },
            { upsert: true }
        );

        await registarLogAdmin(adminNickname || 'Comando', 'Atualizou Valor da Missão', `Novo valor configurado: R$ ${valorNumerico.toLocaleString('pt-BR')}`);
        res.json({ success: true, message: 'Valor das missões diárias atualizado com sucesso!' });
    } catch (e) {
        res.status(500).json({ success: false, message: 'Erro ao salvar configuração.' });
    }
});

app.get('/api/membro/carteira/:nickname', async (req, res) => {
    try {
        const { nickname } = req.params;
        const membro = await User.findOne(
            { nickname: new RegExp(`^${nickname}$`, 'i') },
            'carteiraSaldo ultimoCicloMissoes missoesConcluidasCiclo'
        );

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

        const membro = await User.findOne(
            { nickname: new RegExp('^' + nickname.trim() + '$', 'i') },
            'carteiraSaldo ultimoCicloMissoes missoesConcluidasCiclo historicoMissoes'
        );
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

        const membro = await User.findOne(
            { nickname: new RegExp('^' + nickname + '$', 'i') },
            'emPlantao estadoTurno inicioPlantao segundosAcumulados fotoComprovanteAtiva'
        ).lean();
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

        let membro = await User.findOne(query, 'nickname cargo status historicoTurnos historicoPromocoes historicoSorteios caixaEntrada').lean();
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
        const [totalRegistados, ativos, pendentes, emPlantao] = await Promise.all([
            User.countDocuments(),
            User.countDocuments({ status: 'ativo' }),
            User.countDocuments({ status: 'pendente' }),
            User.countDocuments({ emPlantao: true })
        ]);

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
        const membroAntigo = await User.findById(id, 'nickname cargo status').lean();
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

        const membro = await User.findByIdAndUpdate(id, { $set: updateData }, { new: true, select: 'nickname cargo status' }).lean();
        const nomeAutor = autor || 'Comando';

        if (cargo && cargo !== membroAntigo.cargo) {
            const acaoStr = cargoAniPrecedencia(cargo, membroAntigo.cargo) ? 'Promoção de Cargo' : 'Alteração / Rebaixamento de Cargo';
            await User.updateOne({ _id: id }, { $push: { historicoPromocoes: { novoCargo: cargo, cargoAnterior: membroAntigo.cargo, data: new Date() } } });
            await registarLogAdmin(nomeAutor, acaoStr, `Membro ${membro.nickname} alterado de ${membroAntigo.cargo} para ${cargo} por ${nomeAutor}`);
        }

        if (status && status !== membroAntigo.status) {
            await registarLogAdmin(nomeAutor, 'Alteração de Status', `Membro ${membro.nickname} alterou status para ${status} por ${nomeAutor}`);
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
        const { autor } = req.body;
        const membro = await User.findById(id, 'nickname').lean();
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
        await registarLogAdmin(autor || 'Comando', 'Fim de Turno Forçado', `Turno de ${membro.nickname} encerrado à força por ${autor || 'Comando'}.`);

        res.json({ success: true, message: `Turno de ${membro.nickname} encerrado à força com sucesso!` });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Erro ao forçar fim de turno.' });
    }
});

app.put('/api/admin/membro/resetar-turnos/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { autor } = req.body;
        const membro = await User.findByIdAndUpdate(id, { $set: { historicoTurnos: [] } }, { new: true, select: 'nickname' }).lean();
        if (!membro) return res.status(404).json({ success: false, message: 'Membro não encontrado.' });
        io.emit('atualizar_status_geral_tropa');
        await registarLogAdmin(autor || 'Comando', 'Reset de Turnos', `Histórico de turnos de ${membro.nickname} foi limpo por ${autor || 'Comando'}.`);
        res.json({ success: true, message: 'Turnos resetados com sucesso!' });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Erro ao resetar turnos.' });
    }
});

app.delete('/api/admin/membro/:id/turno/:turnoId', async (req, res) => {
    try {
        const { id, turnoId } = req.params;
        const { autor } = req.query;
        const membro = await User.findByIdAndUpdate(
            id,
            { $pull: { historicoTurnos: { _id: turnoId } } },
            { new: true, select: 'nickname' }
        ).lean();
        if (!membro) return res.status(404).json({ success: false, message: 'Membro não encontrado.' });

        io.emit('atualizar_status_geral_tropa');
        await registarLogAdmin(autor || 'Comando', 'Exclusão de Turno Específico', `Um turno foi removido do histórico de ${membro.nickname} por ${autor || 'Comando'}.`);
        res.json({ success: true, message: 'Turno removido com sucesso!' });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Erro ao remover turno.' });
    }
});

app.delete('/api/admin/membro/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { autor } = req.body;
        const membro = await User.findByIdAndDelete(id, { select: 'nickname' }).lean();
        if (!membro) return res.status(404).json({ success: false, message: 'Membro não encontrado.' });
        io.emit('atualizar_status_geral_tropa');
        await registarLogAdmin(autor || 'Comando', 'Demissão / Exclusão', `Membro ${membro.nickname} foi demitido/removido por ${autor || 'Comando'}.`);
        res.json({ success: true, message: 'Membro demitido/removido com sucesso!' });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Erro ao remover membro.' });
    }
});

app.get('/api/admin/ranking/turnos', async (req, res) => {
    try {
        const configRanking = await ConfigSorteio.collection.findOne({ chave: 'config_ranking_semanal' });
        const dataCorte = configRanking && configRanking.dataUltimoReset ? new Date(configRanking.dataUltimoReset).getTime() : null;

        const membros = await User.find(
            { 'historicoTurnos.0': { $exists: true } },
            'nickname cargo historicoTurnos.duracao historicoTurnos.data historicoTurnos.manual'
        ).lean();

        const ranking = [];
        for (let i = 0; i < membros.length; i++) {
            const m = membros[i];
            let totalSegundos = 0;
            const turnos = m.historicoTurnos || [];

            for (let j = 0; j < turnos.length; j++) {
                const t = turnos[j];
                if (dataCorte && new Date(t.data).getTime() <= dataCorte) continue;
                if (turnoEstaNoHorarioPermitido(t)) {
                    totalSegundos += converterDuracaoParaSegundos(t.duracao);
                }
            }

            if (totalSegundos > 0) {
                ranking.push({
                    nickname: m.nickname,
                    cargo: m.cargo || 'Privado',
                    totalSegundos: totalSegundos,
                    totalFormatado: converterSegundosParaDuracao(totalSegundos)
                });
            }
        }

        ranking.sort((a, b) => b.totalSegundos - a.totalSegundos);
        res.json({ success: true, ranking: ranking.slice(0, 10) });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Erro ao carregar ranking de turnos.' });
    }
});

app.put('/api/admin/ranking/resetar', async (req, res) => {
    try {
        const { adminNickname } = req.body;
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

        await registarLogAdmin(adminNickname || 'Comando', 'Reset de Ranking', `Novo ciclo semanal iniciado por ${adminNickname || 'Comando'}.`);
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

        const h = parseInt(horas, 10) || 0;
        const m = parseInt(minutos, 10) || 0;
        const s = parseInt(segundos, 10) || 0;
        const totalSegundos = (h * 3600) + (m * 60) + s;

        if (totalSegundos <= 0) {
            return res.status(400).json({ success: false, message: 'O tempo a adicionar deve ser superior a 0.' });
        }

        const duracaoFormatada = converterSegundosParaDuracao(totalSegundos);

        const novoTurnoManual = {
            data: new Date(),
            duracao: duracaoFormatada,
            manual: true,
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
        await registarLogAdmin(adminNickname, 'Injeção Manual de Tempo', `Adicionado ${duracaoFormatada} para ${targetNickname} por Mestre. Motivo: ${motivo}`);
        res.json({ success: true, message: `Adicionado com sucesso ${duracaoFormatada} para ${targetNickname}!` });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Erro interno ao adicionar tempo: ' + error.message });
    }
});

app.get('/api/membro/provas/status/:nickname', async (req, res) => {
    try {
        const membro = await User.findOne(
            { nickname: new RegExp('^' + req.params.nickname + '$', 'i') },
            'cargo cooldownProvaAte historicoTurnos.duracao historicoTurnos.data historicoTurnos.manual'
        ).lean();
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
        const membro = await User.findOne({ nickname: new RegExp('^' + nickname + '$', 'i') }, '_id cargo').lean();
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
    const dataCorte = config.dataUltimoReset ? new Date(config.dataUltimoReset).getTime() : null;

    const membros = await User.find(
        { 'historicoTurnos.0': { $exists: true } },
        'nickname cargo historicoTurnos.duracao historicoTurnos.data historicoTurnos.manual'
    ).lean();

    const elegiveis = membros.filter(m => {
      const nicknameLower = m.nickname.toLowerCase().trim();
      if (ganhadoresCiclo.includes(nicknameLower)) return false;

      let totalSegundos = 0;
      const turnos = m.historicoTurnos || [];
      for (let i = 0; i < turnos.length; i++) {
          const t = turnos[i];
          if (dataCorte && new Date(t.data).getTime() <= dataCorte) continue;
          if (turnoEstaNoHorarioPermitido(t) && turnoPertenceAoCicloAtual(t)) {
              totalSegundos += converterDuracaoParaSegundos(t.duracao);
          }
      }

      return totalSegundos >= 7200;
    });

    res.json({ success: true, elegiveis: elegiveis.map(m => ({ id: m._id, nickname: m.nickname, cargo: m.cargo || 'Privado' })) });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Erro ao carregar elegíveis.' });
  }
});

async function executarResetCiclo(req, res) {
    try {
        const { adminNickname } = req.body || {};
        await ConfigSorteio.collection.updateOne(
            { chave: 'sorteio_ativo' },
            { $set: { chave: 'sorteio_ativo', ganhadoresCiclo: [], dataUltimoReset: new Date() } },
            { upsert: true }
        );
        io.emit('atualizar_status_geral_tropa');
        await registarLogAdmin(adminNickname || 'Comando', 'Reset de Elegíveis', `Lista de elegíveis zerada por ${adminNickname || 'Comando'}.`);
        res.json({ success: true, message: 'Elegíveis resetados com sucesso! A lista foi limpa.' });
    } catch (e) {
        res.status(500).json({ success: false, message: 'Erro ao resetar elegíveis.' });
    }
}

app.post('/api/admin/sorteio/resetar-ciclo', executarResetCiclo);
app.post('/api/admin/sorteio/resetar-elegiveis', executarResetCiclo);

app.post('/api/admin/sorteio/realizar', async (req, res) => {
  try {
    const { premios, adminNickname } = req.body;
    const config = await obterConfigSorteio();
    const ganhadoresCiclo = config.ganhadoresCiclo || [];
    const dataCorte = config.dataUltimoReset ? new Date(config.dataUltimoReset).getTime() : null;

    const membros = await User.find(
        { 'historicoTurnos.0': { $exists: true } },
        'nickname cargo historicoTurnos.duracao historicoTurnos.data historicoTurnos.manual'
    ).lean();

    const elegiveis = membros.filter(m => {
      const nicknameLower = m.nickname.toLowerCase().trim();
      if (ganhadoresCiclo.includes(nicknameLower)) return false;

      let totalSegundos = 0;
      const turnos = m.historicoTurnos || [];
      for (let i = 0; i < turnos.length; i++) {
          const t = turnos[i];
          if (dataCorte && new Date(t.data).getTime() <= dataCorte) continue;
          if (turnoEstaNoHorarioPermitido(t) && turnoPertenceAoCicloAtual(t)) {
              totalSegundos += converterDuracaoParaSegundos(t.duracao);
          }
      }

      return totalSegundos >= 7200;
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

    await registarLogAdmin(adminNickname || 'Comando', 'Giro da Roleta Oficial', `Vencedor: ${vencedor.nickname} | Prêmio: ${premioSorteado} (Realizado por ${adminNickname || 'Comando'})`);

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

    const membros = await User.find(
        { 'historicoTurnos.0': { $exists: true } },
        'nickname cargo historicoTurnos.data historicoTurnos.manual'
    ).lean();

    const elegiveis = membros.filter(m => {
      const nicknameLower = m.nickname.toLowerCase().trim();
      if (ganhadoresCiclo.includes(nicknameLower)) return false;

      return (m.historicoTurnos || []).some(t => turnoPertenceAoCicloAtual(t));
    });

    res.json({ success: true, elegiveis: elegiveis.map(m => ({ id: m._id, nickname: m.nickname, cargo: m.cargo || 'Privado' })) });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Erro ao carregar elegíveis de 1 turno.' });
  }
});

app.post('/api/admin/sorteio/realizar-um-turno', async (req, res) => {
  try {
    const { premios, adminNickname } = req.body;
    const config = await obterConfigSorteio();
    const ganhadoresCiclo = config.ganhadoresCiclo || [];

    const membros = await User.find(
        { 'historicoTurnos.0': { $exists: true } },
        'nickname cargo historicoTurnos.data historicoTurnos.manual'
    ).lean();

    const elegiveis = membros.filter(m => {
      const nicknameLower = m.nickname.toLowerCase().trim();
      if (ganhadoresCiclo.includes(nicknameLower)) return false;

      return (m.historicoTurnos || []).some(t => turnoPertenceAoCicloAtual(t));
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

    await registarLogAdmin(adminNickname || 'Comando', 'Giro Roleta 1 Turno Hoje', `Vencedor: ${vencedor.nickname} | Prêmio: ${premioSorteado} (Realizado por ${adminNickname || 'Comando'})`);

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

  socket.on('entrar_canal_voz', (data) => {
    let salaVozId = (data && data.salaId) ? data.salaId : 'canal_voz_geral';
    socket.join(salaVozId);
    socket.nicknameVoz = (data && data.nickname) ? data.nickname : 'Operacional';
    socket.cargoVoz = (data && data.cargo) ? data.cargo : 'Privado';
    socket.salaVozId = salaVozId;

    io.to(salaVozId).emit('utilizadores_no_voz', obterUtilizadoresVoz(salaVozId));
  });

  socket.on('sinal_WebRTC', (data) => {
    if (data && data.to) {
      socket.to(data.to).emit('sinal_WebRTC', { from: socket.id, signal: data.signal });
    }
  });

  socket.on('admin_mutar_membro', ({ targetSocketId, mutado }) => {
    io.to(targetSocketId).emit('forcar_mute_servidor', { mutado });
  });

  socket.on('sair_canal_voz', () => {
    if (socket.salaVozId) {
      socket.leave(socket.salaVozId);
      io.to(socket.salaVozId).emit('utilizadores_no_voz', obterUtilizadoresVoz(socket.salaVozId));
      socket.salaVozId = null;
    }
  });

  socket.on('disconnect', () => {
    const user = usuariosOnline[socket.id];
    if (user) {
      delete usuariosOnline[socket.id];
      atualizarEstadoOperacional(user.salaId);
    }

    if (socket.salaVozId) {
      socket.leave(socket.salaVozId);
      io.to(socket.salaVozId).emit('utilizadores_no_voz', obterUtilizadoresVoz(socket.salaVozId));
    }
  });
});

function obterUtilizadoresVoz(salaVozId) {
  const socketsNaSala = io.sockets.adapter.rooms.get(salaVozId);
  if (!socketsNaSala) return [];

  const lista = [];
  for (const socketId of socketsNaSala) {
      const s = io.sockets.sockets.get(socketId);
      if (s && s.nicknameVoz) {
          lista.push({ id: s.id, nickname: s.nicknameVoz, cargo: s.cargoVoz });
      }
  }
  return lista;
}

async function atualizarEstadoOperacional(salaId) {
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
