const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const dotenv = require('dotenv');
const cors = require('cors');
const webpush = require('web-push');
const path = require('path');
const mongoose = require('mongoose');
const conectarDB = require('./config/db');
const User = require('./models/User');
const BatePonto = require('./models/BatePonto');
const ConfigSorteio = require('./models/ConfigSorteio');
const LogAdmin = require('./models/LogAdmin');
const Justificativa = require('./models/Justificativa');

dotenv.config({ path: path.join(__dirname, '.env') });
dotenv.config(); // Fallback para diretório atual
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

app.get('/manifest.json', (req, res) => {
    res.setHeader('Content-Type', 'application/manifest+json');
    res.sendFile(path.join(__dirname, 'public', 'manifest.json'));
});

// Ícones dinâmicos do PWA com margem segura centralizada (Maskable Safe-Zone) e padrão tático escuro
function gerarSvgIconeSalazar(tamanho = 512) {
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="${tamanho}" height="${tamanho}">
  <defs>
    <linearGradient id="bgGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#0f172a"/>
      <stop offset="50%" stop-color="#070d16"/>
      <stop offset="100%" stop-color="#020617"/>
    </linearGradient>
    <linearGradient id="shieldGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#38bdf8"/>
      <stop offset="50%" stop-color="#0284c7"/>
      <stop offset="100%" stop-color="#0369a1"/>
    </linearGradient>
    <linearGradient id="goldGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#fde047"/>
      <stop offset="100%" stop-color="#ca8a04"/>
    </linearGradient>
    <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="4" stdDeviation="8" flood-color="#38bdf8" flood-opacity="0.5"/>
    </filter>
  </defs>
  <rect width="512" height="512" fill="url(#bgGrad)"/>
  <rect x="16" y="16" width="480" height="480" rx="48" fill="none" stroke="rgba(56, 189, 248, 0.25)" stroke-width="4"/>
  <!-- Margem segura centralizada (Maskable Safe Zone: 80% do canvas = 410px centralizados) -->
  <g transform="translate(256, 256)" filter="url(#glow)">
    <!-- Escudo Tático -->
    <path d="M 0,-150 L 130,-90 L 130,30 C 130,120 70,175 0,205 C -70,175 -130,120 -130,30 L -130,-90 Z" fill="url(#shieldGrad)" stroke="#38bdf8" stroke-width="8"/>
    <!-- Detalhe Interno do Escudo -->
    <path d="M 0,-130 L 110,-80 L 110,25 C 110,105 60,155 0,182 C -60,155 -110,105 -110,25 L -110,-80 Z" fill="#070d16" opacity="0.85"/>
    <!-- Emblema Militar "S" -->
    <text x="0" y="45" font-family="'Inter', -apple-system, sans-serif" font-size="140" font-weight="900" fill="url(#goldGrad)" text-anchor="middle" letter-spacing="-2">S</text>
    <!-- Estrelas de Patente -->
    <polygon points="0,-105 8,-90 25,-90 12,-78 17,-62 0,-72 -17,-62 -12,-78 -25,-90 -8,-90" fill="#fde047"/>
  </g>
</svg>`;
}

// Rota segura para servir o GIF da Glock com suporte a caminhos diretos, espaços e aliases
app.get(['/mac-glock.gif', '/assets/mac-glock.gif', '/glock.gif'], (req, res) => {
    const fs = require('fs');
    const directPaths = [
        path.join(__dirname, 'public', 'mac-glock.gif'),
        path.join(__dirname, 'public', 'assets', 'mac-glock.gif'),
        path.join(__dirname, 'assets', 'mac-glock.gif'),
        path.join(__dirname, 'mac-glock.gif')
    ];

    for (const directPath of directPaths) {
        if (fs.existsSync(directPath)) {
            res.setHeader('Content-Type', 'image/gif');
            res.setHeader('Cache-Control', 'public, max-age=86400');
            return res.sendFile(directPath);
        }
    }

    const possibleDirs = [
        path.join(__dirname, 'public'),
        path.join(__dirname, 'public', 'assets'),
        path.join(__dirname, 'assets'),
        __dirname
    ];
    for (const dir of possibleDirs) {
        if (fs.existsSync(dir)) {
            try {
                const files = fs.readdirSync(dir);
                const found = files.find(f => (f.toLowerCase().includes('glock') || f.toLowerCase().includes('mac')) && f.toLowerCase().endsWith('.gif'));
                if (found) {
                    res.setHeader('Content-Type', 'image/gif');
                    res.setHeader('Cache-Control', 'public, max-age=86400');
                    return res.sendFile(path.join(dir, found));
                }
            } catch (e) {}
        }
    }

    // Fallback caso o arquivo ainda não esteja pronto
    const fallbackIcon = path.join(__dirname, 'public', 'icons', 'icon-192.png');
    if (fs.existsSync(fallbackIcon)) {
        res.setHeader('Content-Type', 'image/svg+xml');
        return res.sendFile(fallbackIcon);
    }
    res.status(404).send('GIF não encontrado');
});

// Gerador procedural de PNG binário autêntico para validação do PWABuilder e ícones de app nativos
const zlib = require('zlib');

function crc32Buffer(buf) {
    let table = crc32Buffer.table;
    if (!table) {
        table = new Int32Array(256);
        for (let i = 0; i < 256; i++) {
            let c = i;
            for (let j = 0; j < 8; j++) {
                c = (c & 1) ? (-306674912 ^ (c >>> 1)) : (c >>> 1);
            }
            table[i] = c;
        }
        crc32Buffer.table = table;
    }
    let crc = -1;
    for (let i = 0; i < buf.length; i++) {
        crc = (crc >>> 8) ^ table[(crc ^ buf[i]) & 0xff];
    }
    return (crc ^ -1) >>> 0;
}

function criarChunkPng(type, data) {
    const typeBuf = Buffer.from(type, 'ascii');
    const len = data.length;
    const chunk = Buffer.alloc(8 + len + 4);
    chunk.writeUInt32BE(len, 0);
    typeBuf.copy(chunk, 4);
    data.copy(chunk, 8);
    const crcTarget = Buffer.concat([typeBuf, data]);
    const crcVal = crc32Buffer(crcTarget);
    chunk.writeUInt32BE(crcVal, 8 + len);
    return chunk;
}

const cachePngIcons = {};

function gerarPngIconeBuffer(tamanho = 192) {
    if (cachePngIcons[tamanho]) return cachePngIcons[tamanho];

    const width = tamanho;
    const height = tamanho;
    const rawData = Buffer.alloc(height * (1 + width * 4));
    let offset = 0;

    for (let y = 0; y < height; y++) {
        rawData[offset++] = 0; // Filter type None
        for (let x = 0; x < width; x++) {
            const distCentroX = Math.abs(x - width / 2);
            const distCentroY = Math.abs(y - height / 2);
            const borda = Math.floor(width * 0.08);

            const naBorda = (x >= borda && x <= width - borda && (y === borda || y === height - borda)) ||
                            (y >= borda && y <= height - borda && (x === borda || x === width - borda));

            const raioEscudo = width * 0.32;
            const dentroEscudo = (distCentroX < raioEscudo && distCentroY < raioEscudo);

            if (naBorda) {
                // Vermelho tático #ef4444
                rawData[offset++] = 239; rawData[offset++] = 68; rawData[offset++] = 68; rawData[offset++] = 255;
            } else if (dentroEscudo) {
                // Núcleo tático #dc2626
                rawData[offset++] = 220; rawData[offset++] = 38; rawData[offset++] = 38; rawData[offset++] = 255;
            } else {
                // Fundo escuro #07090f
                rawData[offset++] = 7; rawData[offset++] = 9; rawData[offset++] = 15; rawData[offset++] = 255;
            }
        }
    }

    const idatData = zlib.deflateSync(rawData);
    const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

    const ihdrBuf = Buffer.alloc(13);
    ihdrBuf.writeUInt32BE(width, 0);
    ihdrBuf.writeUInt32BE(height, 4);
    ihdrBuf[8] = 8; // 8 bits per channel
    ihdrBuf[9] = 6; // RGBA
    ihdrBuf[10] = 0; // Deflate
    ihdrBuf[11] = 0; // Default filter
    ihdrBuf[12] = 0; // Non-interlaced

    const ihdrChunk = criarChunkPng('IHDR', ihdrBuf);
    const idatChunk = criarChunkPng('IDAT', idatData);
    const iendChunk = criarChunkPng('IEND', Buffer.alloc(0));

    const finalBuffer = Buffer.concat([sig, ihdrChunk, idatChunk, iendChunk]);
    cachePngIcons[tamanho] = finalBuffer;
    return finalBuffer;
}

app.get('/icons/icon-192.png', (req, res) => {
    const fs = require('fs');
    const localFile = path.join(__dirname, 'public', 'icons', 'icon-192.png');
    if (fs.existsSync(localFile) && fs.statSync(localFile).size > 100) {
        res.setHeader('Content-Type', 'image/png');
        return res.sendFile(localFile);
    }
    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.send(gerarPngIconeBuffer(192));
});

app.get(['/icons/salazar-shield.svg', '/icons/salazar-logo.svg', '/icons/salazar-s.svg'], (req, res) => {
    res.setHeader('Content-Type', 'image/svg+xml');
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.send(gerarSvgIconeSalazar(512));
});

app.get(['/icons/icon-512.png', '/icons/apple-touch-icon.png', '/apple-touch-icon.png'], (req, res) => {
    const fs = require('fs');
    const localFile = path.join(__dirname, 'public', 'icons', 'icon-512.png');
    if (fs.existsSync(localFile) && fs.statSync(localFile).size > 100) {
        res.setHeader('Content-Type', 'image/png');
        return res.sendFile(localFile);
    }
    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.send(gerarPngIconeBuffer(512));
});

// Helper para localizar arquivo APK real e válido (maior que 100 KB)
function obterCaminhoApkValido() {
    const fs = require('fs');
    const possiveisCaminhos = [
        process.env.APK_FILE_PATH,
        path.join(__dirname, 'public', 'downloads', 'salazar.apk'),
        path.join(__dirname, 'public', 'salazar.apk'),
        path.join(__dirname, 'public', 'app.apk'),
        path.join(__dirname, 'app.apk'),
        path.join(__dirname, 'downloads', 'salazar.apk')
    ].filter(Boolean);

    for (const p of possiveisCaminhos) {
        try {
            if (fs.existsSync(p)) {
                const stats = fs.statSync(p);
                // Arquivo APK Android real e válido possui no mínimo > 100 KB (102.400 bytes)
                if (stats.isFile() && stats.size > 102400) {
                    return { caminho: p, tamanho: stats.size };
                }
            }
        } catch (e) {}
    }
    return null;
}

// Endpoint para o frontend consultar a existência prévia de APK real
app.get('/api/app/status-apk', (req, res) => {
    const apkValido = obterCaminhoApkValido();
    if (apkValido) {
        return res.json({ success: true, disponivel: true, tamanho: apkValido.tamanho });
    }
    if (process.env.APK_DOWNLOAD_URL) {
        return res.json({ success: true, disponivel: true, urlExterna: true });
    }
    res.json({ success: true, disponivel: false });
});

// Rota de Download do APK Android (serve apenas arquivos válidos e reais)
app.get(['/app.apk', '/salazar.apk', '/downloads/salazar.apk', '/api/app/download-apk'], (req, res) => {
    const apkValido = obterCaminhoApkValido();

    if (apkValido) {
        return res.download(apkValido.caminho, 'Salazar_Operacional.apk');
    }

    if (process.env.APK_DOWNLOAD_URL) {
        return res.redirect(process.env.APK_DOWNLOAD_URL);
    }

    // Limpa preventivamente arquivo mock minúsculo se existir no diretório
    try {
        const fs = require('fs');
        const mockApk = path.join(__dirname, 'public', 'downloads', 'salazar.apk');
        if (fs.existsSync(mockApk)) {
            const stats = fs.statSync(mockApk);
            if (stats.size < 102400) {
                fs.unlinkSync(mockApk);
            }
        }
    } catch (e) {}

    res.status(404).json({
        success: false,
        message: 'O pacote .APK compilado ainda não está publicado no servidor. Instale o aplicativo diretamente pela tela inicial (PWA).'
    });
});

app.get('/sw.js', (req, res) => {
    res.setHeader('Content-Type', 'application/javascript');
    res.sendFile(path.join(__dirname, 'public', 'sw.js'));
});

// Endpoint para fornecer a chave pública VAPID ao frontend
app.get('/api/push-public-key', (req, res) => {
    res.json({ success: true, publicKey: publicVapidKey });
});

// Endpoint seguro para verificar saúde da conexão com o MongoDB
app.get('/api/db-status', (req, res) => {
    const estados = { 0: 'desconectado', 1: 'conectado', 2: 'conectando', 3: 'desconectando' };
    const estadoAtual = mongoose.connection.readyState;
    res.json({
        success: estadoAtual === 1,
        estado: estados[estadoAtual] || 'desconhecido',
        codigoEstado: estadoAtual,
        host: mongoose.connection.host || null,
        mensagem: estadoAtual === 1 ? 'Conexão ativa com o banco de dados.' : 'Banco de dados não está conectado no momento.'
    });
});

// --- ROTINA ATÔMICA DE PURGA PARA ELIMINAR O LIMITE DE 16MB DO MONGODB (CODE 10334) ---
async function limparDocumentoUsuarioSobrecarga(userId) {
    try {
        const usuario = await User.findById(userId, 'historicoTurnos historicoMissoes caixaEntrada comprovantesTurnoAtivo').lean();
        if (!usuario) return;

        const updateSet = {};

        // 1. Poda notificações antigas
        if (Array.isArray(usuario.caixaEntrada) && usuario.caixaEntrada.length > 20) {
            updateSet.caixaEntrada = usuario.caixaEntrada.slice(-20);
        }

        // 2. Remove base64 pesados de turnos antigos (mantém imagem apenas nos 4 mais recentes)
        if (Array.isArray(usuario.historicoTurnos) && usuario.historicoTurnos.length > 0) {
            updateSet.historicoTurnos = usuario.historicoTurnos.slice(-35).map((t, idx, arr) => {
                const ehMuitoRecente = idx >= arr.length - 4;
                return {
                    data: t.data || new Date(),
                    duracao: t.duracao || '00:00:00',
                    manual: !!t.manual,
                    fotoComprovante: (ehMuitoRecente && t.fotoComprovante && t.fotoComprovante.length < 200000) ? t.fotoComprovante : (t.fotoComprovante ? 'Comprovante arquivado' : ''),
                    comprovantesVerificacao: (ehMuitoRecente && Array.isArray(t.comprovantesVerificacao)) ? t.comprovantesVerificacao.slice(-3) : []
                };
            });
        }

        // 3. Remove base64 pesados de missões antigas
        if (Array.isArray(usuario.historicoMissoes) && usuario.historicoMissoes.length > 0) {
            updateSet.historicoMissoes = usuario.historicoMissoes.slice(-15).map((m, idx, arr) => {
                const ehRecente = idx >= arr.length - 3;
                return {
                    data: m.data || new Date(),
                    ciclo: m.ciclo || 'Atual',
                    motivo: m.motivo || 'Missão',
                    comprovante: (ehRecente && m.comprovante && m.comprovante.length < 200000) ? m.comprovante : (m.comprovante ? 'Comprovante arquivado' : '')
                };
            });
        }

        if (Array.isArray(usuario.comprovantesTurnoAtivo) && usuario.comprovantesTurnoAtivo.length > 6) {
            updateSet.comprovantesTurnoAtivo = usuario.comprovantesTurnoAtivo.slice(-6);
        }

        await User.updateOne({ _id: userId }, { $set: updateSet });
    } catch (errLimpeza) {
        console.error("Aviso ao executar purga atômica:", errLimpeza.message);
        try {
            await User.updateOne(
                { _id: userId },
                {
                    $set: {
                        fotoComprovanteAtiva: '',
                        caixaEntrada: [],
                        comprovantesTurnoAtivo: []
                    }
                }
            );
        } catch (e) {}
    }
}

// --- SISTEMA UNIFICADO DE NOTIFICAÇÃO INDIVIDUAL COM ESCOPO ESTRITO ---
async function enviarNotificacaoMembro(membroIdOuNick, { titulo, mensagem, tag, url }) {
    try {
        let query = { _id: membroIdOuNick };
        if (!String(membroIdOuNick).match(/^[0-9a-fA-F]{24}$/)) {
            query = { nickname: new RegExp('^' + escaparRegex(String(membroIdOuNick).trim()) + '$', 'i') };
        }

        const membro = await User.findOne(query, '_id nickname pushSubscription').lean();
        if (!membro) return;

        const notifObj = {
            titulo: titulo || 'Notificação Operacional',
            mensagem: mensagem || '',
            data: new Date()
        };

        // Salva na caixa de entrada individual do membro com histórico controlado
        await User.updateOne(
            { _id: membro._id },
            {
                $push: {
                    caixaEntrada: {
                        $each: [notifObj],
                        $slice: -25
                    }
                }
            }
        );

        const tagFinal = tag || ('notif_' + Date.now());

        // Dispara Web Push exclusivo para este membro se possuir subscrição ativa
        if (membro.pushSubscription && membro.pushSubscription.endpoint) {
            const pushPayload = JSON.stringify({
                id: tagFinal,
                tag: tagFinal,
                title: notifObj.titulo,
                body: notifObj.mensagem.replace(/<[^>]*>?/gm, ''),
                url: url || '/dashboard.html'
            });

            webpush.sendNotification(membro.pushSubscription, pushPayload).catch(async (err) => {
                if (err.statusCode === 410 || err.statusCode === 404) {
                    await User.updateOne({ _id: membro._id }, { $unset: { pushSubscription: 1 } });
                }
            });
        }

        // Emite evento em tempo real via Socket.IO para o cliente do membro
        io.emit('notificacao_individual', {
            nickname: membro.nickname.toLowerCase().trim(),
            titulo: notifObj.titulo,
            mensagem: notifObj.mensagem,
            tag: tagFinal
        });
    } catch (e) {
        console.error("Erro ao enviar notificação individual ao membro:", e);
    }
}

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

function escaparRegex(str) {
    return String(str || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function converterSegundosParaDuracao(segundosTotais) {
  const segundosSeguros = Math.max(0, parseInt(segundosTotais, 10) || 0);
  const horas = String(Math.floor(segundosSeguros / 3600)).padStart(2, '0');
  const minutos = String(Math.floor((segundosSeguros % 3600) / 60)).padStart(2, '0');
  const segundos = String(segundosSeguros % 60).padStart(2, '0');
  return `${horas}:${minutos}:${segundos}`;
}

// Helper oficial para o fuso horário regulamentar de Brasília (America/Sao_Paulo / UTC-3)
function obterComponentesBrasilia(dateObj = new Date()) {
    const d = new Date(dateObj);
    const formatador = new Intl.DateTimeFormat('en-US', {
        timeZone: 'America/Sao_Paulo',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false
    });
    const partes = formatador.formatToParts(d);
    const mapa = {};
    for (const p of partes) mapa[p.type] = p.value;
    return {
        ano: parseInt(mapa.year, 10),
        mes: parseInt(mapa.month, 10),
        dia: parseInt(mapa.day, 10),
        hora: parseInt(mapa.hour === '24' ? '0' : mapa.hour, 10),
        minuto: parseInt(mapa.minute, 10),
        segundo: parseInt(mapa.second, 10)
    };
}

const obterComponentesRecife = obterComponentesBrasilia;

function obterDataEmBrasil(timestamp = Date.now()) {
    const comp = obterComponentesBrasilia(new Date(timestamp));
    return new Date(Date.UTC(comp.ano, comp.mes - 1, comp.dia, comp.hora, comp.minuto, comp.segundo));
}

function horaBrasiliaEstaNaJanelaTurno(dateObj = new Date()) {
    const comp = obterComponentesBrasilia(dateObj);
    const hora = comp.hora;
    const minuto = comp.minuto;
    // Janela oficial de Brasília (America/Sao_Paulo): 17:00:00 até 02:00:00
    if (hora >= 17 && hora <= 23) return true;
    if (hora >= 0 && hora < 2) return true;
    if (hora === 2 && minuto === 0 && comp.segundo === 0) return true;
    return false;
}

const horaRecifeEstaNaJanelaTurno = horaBrasiliaEstaNaJanelaTurno;

function obterEtapaHorarioBrasilia(dateObj = new Date()) {
    const comp = obterComponentesBrasilia(dateObj);
    const hora = comp.hora;
    const minuto = comp.minuto;
    // Etapa 1: 17h às 20h
    if (hora >= 17 && hora < 20) return 1;
    // Etapa 2: 20h às 23h
    if (hora >= 20 && hora < 23) return 2;
    // Etapa 3: 23h às 02h (sem contabilizar após 02:00)
    if (hora === 23 || hora === 0 || hora === 1 || (hora === 2 && minuto === 0)) return 3;
    return null;
}

function obterDataCicloBrasil(timestamp = Date.now()) {
    const comp = obterComponentesBrasilia(new Date(timestamp));
    const d = new Date(Date.UTC(comp.ano, comp.mes - 1, comp.dia, 12, 0, 0, 0));
    // Ciclo diário oficial de plantão vai das 17h às 02h de Brasília
    if (comp.hora < 2 || (comp.hora === 2 && comp.minuto === 0 && comp.segundo === 0)) {
        d.setUTCDate(d.getUTCDate() - 1);
    }
    return d.toISOString().split('T')[0];
}

// Retorna o timestamp exato do encerramento regulamentar (02:00:00 America/Sao_Paulo = 05:00:00 UTC)
function obterTimestampLimite02hBrasilia(inicioMs) {
    const comp = obterComponentesBrasilia(new Date(inicioMs));
    let ano = comp.ano;
    let mes = comp.mes;
    let dia = comp.dia;

    if (comp.hora >= 17) {
        return new Date(Date.UTC(ano, mes - 1, dia + 1, 5, 0, 0, 0)).getTime();
    } else if (comp.hora < 2) {
        return new Date(Date.UTC(ano, mes - 1, dia, 5, 0, 0, 0)).getTime();
    } else {
        return new Date(Date.UTC(ano, mes - 1, dia, 5, 0, 0, 0)).getTime();
    }
}

const obterTimestampLimite02hRecife = obterTimestampLimite02hBrasilia;

function calcularSegundosValidosNoHorario(inicioTimestamp, fimTimestamp = Date.now()) {
    const inicioMs = new Date(inicioTimestamp).getTime();
    const fimMs = new Date(fimTimestamp).getTime();
    if (isNaN(inicioMs) || isNaN(fimMs) || fimMs <= inicioMs) return 0;

    const limite02hMs = obterTimestampLimite02hBrasilia(inicioMs);
    // Trava estrita: nenhum segundo após as 02:00:00 do fuso de Brasília é contabilizado
    const fimValidoMs = Math.min(fimMs, limite02hMs);

    if (fimValidoMs <= inicioMs) return 0;
    return Math.floor((fimValidoMs - inicioMs) / 1000);
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

// --- ROTAS DE JUSTIFICATIVAS DE MEMBROS ---
app.get('/api/membro/justificativas/:nickname', async (req, res) => {
    try {
        const { nickname } = req.params;
        const justificativas = await Justificativa.find({
            nickname: new RegExp('^' + nickname.trim() + '$', 'i')
        }).sort({ dataCriacao: -1 }).limit(30).lean();

        res.json({ success: true, justificativas });
    } catch (e) {
        console.error("Erro ao listar justificativas do membro:", e);
        res.status(500).json({ success: false, message: 'Erro ao carregar justificativas.' });
    }
});

app.post('/api/membro/justificativa', async (req, res) => {
    try {
        if (mongoose.connection.readyState !== 1) {
            return res.status(503).json({ success: false, message: 'Banco de dados indisponível no momento.' });
        }

        const { nickname, motivo, mensagem } = req.body;
        if (!nickname || !motivo || !mensagem) {
            return res.status(400).json({ success: false, message: 'Preencha o motivo e a descrição da justificativa.' });
        }

        const membro = await User.findOne({ nickname: new RegExp('^' + nickname.trim() + '$', 'i') }, 'cargo').lean();
        const cargoMembro = membro ? (membro.cargo || 'Privado') : 'Privado';

        const novaJustificativa = new Justificativa({
            usuario: membro ? membro._id : null,
            nickname: nickname.trim(),
            cargo: cargoMembro,
            motivo: motivo.trim(),
            mensagem: mensagem.trim(),
            status: 'pendente',
            dataCriacao: new Date()
        });

        await novaJustificativa.save();

        await registarLogAdmin(
            nickname.trim(),
            'Justificativa de Ausência Enviada',
            `Motivo: "${motivo.trim()}". Detalhes: ${mensagem.trim().slice(0, 80)}...`
        );

        io.emit('atualizar_justificativas');
        io.emit('atualizar_status_geral_tropa');

        res.json({
            success: true,
            message: 'Justificativa enviada ao Comando com sucesso!',
            justificativa: novaJustificativa
        });
    } catch (e) {
        console.error("Erro ao enviar justificativa:", e);
        res.status(500).json({ success: false, message: 'Erro ao registar justificativa.' });
    }
});

app.get('/api/admin/justificativas', async (req, res) => {
    try {
        const justificativas = await Justificativa.find().sort({ dataCriacao: -1 }).limit(100).lean();
        res.json({ success: true, justificativas });
    } catch (e) {
        console.error("Erro ao buscar justificativas para ADM:", e);
        res.status(500).json({ success: false, message: 'Erro ao carregar justificativas.' });
    }
});

app.put('/api/admin/justificativa/:id/status', async (req, res) => {
    try {
        const { id } = req.params;
        const { novoStatus, adminNickname, respostaComando } = req.body;

        if (!['pendente', 'aprovada', 'arquivada'].includes(novoStatus)) {
            return res.status(400).json({ success: false, message: 'Status inválido.' });
        }

        const justificativa = await Justificativa.findById(id);
        if (!justificativa) {
            return res.status(404).json({ success: false, message: 'Justificativa não encontrada.' });
        }

        justificativa.status = novoStatus;
        justificativa.analisadoPor = adminNickname || 'Comando';
        justificativa.dataAnalise = new Date();
        if (respostaComando !== undefined) {
            justificativa.respostaComando = respostaComando;
        }

        await justificativa.save();

        // Envia notificação exclusiva para o autor da justificativa
        await enviarNotificacaoMembro(justificativa.nickname, {
            titulo: `📝 Justificativa ${novoStatus.toUpperCase()}`,
            mensagem: `A tua justificativa ("${justificativa.motivo}") foi marcada como <b>${novoStatus.toUpperCase()}</b> por ${adminNickname || 'Comando'}.${respostaComando ? `<br>Observação: ${respostaComando}` : ''}`,
            tag: 'justificativa_' + justificativa._id,
            url: '/dashboard.html'
        });

        await registarLogAdmin(
            adminNickname || 'Comando',
            `Justificativa ${novoStatus.toUpperCase()}`,
            `Justificativa de ${justificativa.nickname} (${justificativa.motivo}) foi definida como ${novoStatus} por ${adminNickname || 'Comando'}.`
        );

        io.emit('atualizar_justificativas');
        io.emit('atualizar_status_geral_tropa');

        res.json({ success: true, message: `Justificativa marcada como ${novoStatus} com sucesso!` });
    } catch (e) {
        console.error("Erro ao atualizar status da justificativa:", e);
        res.status(500).json({ success: false, message: 'Erro ao atualizar status da justificativa.' });
    }
});

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

// --- ENCERRAMENTO AUTOMÁTICO DE TURNOS ÀS 02:05 OU POR FALTA DE VERIFICAÇÃO EM 5 MIN ---
async function verificarFechamentoAutomaticoTurnos() {
    try {
        if (mongoose.connection.readyState !== 1) return;
        const comp = obterComponentesBrasilia(new Date());
        const agoraMs = Date.now();

        // 1. VERIFICAÇÃO CONTÍNUA: Encerra plantão se a verificação de 1h não for confirmada em 5 minutos (300s)
        const operacionaisAtivos = await User.find(
            { estadoTurno: 'ativo', inicioPlantao: { $ne: null } },
            'nickname cargo estadoTurno segundosAcumulados inicioPlantao fotoComprovanteAtiva comprovantesTurnoAtivo'
        );

        for (const membro of operacionaisAtivos) {
            let segundosTotais = Number(membro.segundosAcumulados || 0);
            if (membro.inicioPlantao) {
                const decorrido = Math.floor((agoraMs - new Date(membro.inicioPlantao).getTime()) / 1000);
                if (decorrido > 0) segundosTotais += decorrido;
            }

            const horasCompletadas = Math.floor(segundosTotais / 3600);
            if (horasCompletadas >= 1) {
                const comprovantes = Array.isArray(membro.comprovantesTurnoAtivo) ? membro.comprovantesTurnoAtivo : [];
                const jaConfirmouHoraAtual = comprovantes.some(c => Number(c.horaNumero) === horasCompletadas);

                if (!jaConfirmouHoraAtual) {
                    // Calcula o instante exato em que a hora foi completada
                    const segundosAteHoraCheia = horasCompletadas * 3600;
                    const segundosPassadosDaHora = segundosTotais - segundosAteHoraCheia;

                    // Se passou mais de 5 minutos (300 segundos) sem o envio do print: encerra automaticamente
                    if (segundosPassadosDaHora >= 300) {
                        const duracaoFormatada = converterSegundosParaDuracao(segundosTotais);
                        const horaBrtStr = new Date().toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit', second: '2-digit' });
                        const comprovanteFinal = `Fechamento Automático (Limite de 5 min da ${horasCompletadas}ª hora expirado às ${horaBrtStr} no horário de Brasília)`;

                        const novoTurno = {
                            data: new Date(),
                            duracao: duracaoFormatada,
                            fotoComprovante: comprovanteFinal,
                            comprovantesVerificacao: comprovantes
                        };

                        await User.updateOne(
                            { _id: membro._id },
                            {
                                $push: {
                                    historicoTurnos: { $each: [novoTurno], $slice: -35 }
                                },
                                $set: {
                                    emPlantao: false,
                                    estadoTurno: 'parado',
                                    inicioPlantao: null,
                                    segundosAcumulados: 0,
                                    fotoComprovanteAtiva: '',
                                    comprovantesTurnoAtivo: []
                                }
                            }
                        );

                        await enviarNotificacaoMembro(membro._id, {
                            titulo: '⏱️ Turno Finalizado por Falta de Confirmação',
                            mensagem: `O teu plantão foi encerrado automaticamente às ${horaBrtStr} (horário de Brasília) após o limite de 5 minutos da ${horasCompletadas}ª hora expirar. Duração salva: <b>${duracaoFormatada}</b>.`,
                            tag: 'turno_expirado_' + Date.now(),
                            url: '/dashboard.html'
                        });

                        io.emit('atualizar_estado_turno_usuario', {
                            nickname: membro.nickname.toLowerCase(),
                            estadoTurno: 'parado',
                            motivo: 'expirado_5m',
                            duracaoFormatada
                        });
                        await registarLogAdmin(
                            membro.nickname,
                            'Fim de Turno (Expirado 5m)',
                            `Turno encerrado às ${horaBrtStr} (horário de Brasília) após exceder o limite de 5 minutos para confirmação da ${horasCompletadas}ª hora. Duração salva: ${duracaoFormatada}`
                        );
                    }
                }
            }
        }

        // 2. Dispara o fechamento diário regulamentar na faixa das 02:05 no Horário de Brasília
        if (comp.hora === 2 && comp.minuto >= 5 && comp.minuto <= 7) {
            const membrosEmPlantao = await User.find(
                { $or: [{ emPlantao: true }, { estadoTurno: { $in: ['ativo', 'pausado'] } }] },
                'nickname cargo estadoTurno segundosAcumulados inicioPlantao fotoComprovanteAtiva comprovantesTurnoAtivo'
            );

            for (const membro of membrosEmPlantao) {
                let segundosTotais = Number(membro.segundosAcumulados || 0);
                if (membro.estadoTurno === 'ativo' && membro.inicioPlantao) {
                    // Contabiliza apenas os segundos até as 02:00:00 exatas de Brasília
                    const decorridoValido = calcularSegundosValidosNoHorario(membro.inicioPlantao, Date.now());
                    if (decorridoValido > 0) segundosTotais += decorridoValido;
                }

                const refInicio = membro.inicioPlantao ? new Date(membro.inicioPlantao).getTime() : (Date.now() - (60 * 60 * 1000));
                const limite02hMs = obterTimestampLimite02hBrasilia(refInicio);
                const dataCiclo = obterDataCicloBrasil(limite02hMs - 1000);

                if (segundosTotais >= 5) {
                    const duracaoFormatada = converterSegundosParaDuracao(segundosTotais);
                    const comprovanteFinal = membro.fotoComprovanteAtiva || 'Fechamento Automático (Limite 02:00)';
                    const comprovantesLista = Array.isArray(membro.comprovantesTurnoAtivo) ? membro.comprovantesTurnoAtivo : [];

                    const novoTurno = {
                        data: new Date(limite02hMs),
                        duracao: duracaoFormatada,
                        fotoComprovante: comprovanteFinal,
                        comprovantesVerificacao: comprovantesLista
                    };

                    await User.updateOne(
                        { _id: membro._id },
                        {
                            $push: {
                                historicoTurnos: {
                                    $each: [novoTurno],
                                    $slice: -60
                                },
                                caixaEntrada: {
                                    $each: [{
                                        titulo: '⏱️ Turno Finalizado Automaticamente',
                                        mensagem: `O teu plantão foi encerrado e consolidado automaticamente pelo sistema às 02:05 (limite regulamentar 02:00 horário de Brasília). Duração computada: <b>${duracaoFormatada}</b>.`,
                                        data: new Date()
                                    }],
                                    $slice: -30
                                }
                            },
                            $set: {
                                emPlantao: false,
                                estadoTurno: 'parado',
                                inicioPlantao: null,
                                segundosAcumulados: 0,
                                fotoComprovanteAtiva: '',
                                comprovantesTurnoAtivo: []
                            }
                        }
                    );

                    // Regista o encerramento no modelo BatePonto (Etapa 3: 23h às 02h) sem duplicação de segundos
                    const pontoExistente = await BatePonto.findOne({ usuario: membro._id, data: dataCiclo, etapa: 3 });
                    let segundosFinaisPonto = segundosTotais;
                    if (pontoExistente && pontoExistente.segundosTotais && !pontoExistente.emAndamento) {
                        segundosFinaisPonto += pontoExistente.segundosTotais;
                    }
                    const duracaoPonto = converterSegundosParaDuracao(segundosFinaisPonto);

                    await BatePonto.findOneAndUpdate(
                        { usuario: membro._id, data: dataCiclo, etapa: 3 },
                        {
                            $set: {
                                nickname: membro.nickname,
                                status: 'presente',
                                duracao: duracaoPonto,
                                segundosTotais: segundosFinaisPonto,
                                fotoComprovante: comprovanteFinal,
                                emAndamento: false,
                                dataRegistro: new Date()
                            }
                        },
                        { upsert: true, returnDocument: 'after' }
                    );

                    io.emit('atualizar_estado_turno_usuario', {
                        nickname: membro.nickname.toLowerCase(),
                        estadoTurno: 'parado',
                        motivo: 'fechamento_0205',
                        duracaoFormatada
                    });
                    await registarLogAdmin(membro.nickname, 'Fechamento Automático', `Turno encerrado e consolidado às 02:05 (limite 02:00). Duração válida: ${duracaoFormatada}`);
                } else {
                    // Turno sem tempo válido mínimo, apenas reseta estado sem poluir histórico
                    await User.updateOne(
                        { _id: membro._id },
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
                    io.emit('atualizar_estado_turno_usuario', {
                        nickname: membro.nickname.toLowerCase(),
                        estadoTurno: 'parado',
                        motivo: 'descartado_curto'
                    });
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
        if (mongoose.connection.readyState !== 1) return;
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
const ultimosLoginsRegistrados = new Map();

app.post('/api/auth/login', async (req, res) => {
    try {
        const { nickname, senha, password } = req.body;
        const passFinal = senha || password;
        if (!nickname || !passFinal) return res.status(400).json({ success: false, message: 'Preencha os campos.' });

        if (mongoose.connection.readyState !== 1) {
            return res.status(503).json({ success: false, message: 'Conexão com a base de dados indisponível no momento. Tente novamente em instantes.' });
        }

        const user = await User.findOne({ nickname: new RegExp('^' + nickname.trim() + '$', 'i') }, 'nickname password cargo role status').lean();
        if (!user) return res.status(400).json({ success: false, message: 'Utilizador não encontrado.' });
        if (user.password && user.password !== passFinal) {
            return res.status(400).json({ success: false, message: 'Senha incorreta.' });
        }
        if (user.status === 'pendente') {
            return res.status(403).json({ success: false, message: 'A sua conta aguarda aprovação do Comando para ter acesso ao site.' });
        }

        // Evita gravar entradas duplicadas de login para o mesmo usuário em intervalo menor que 10 segundos
        const nickChave = user.nickname.toLowerCase().trim();
        const agoraMs = Date.now();
        const ultimoLogin = ultimosLoginsRegistrados.get(nickChave);

        if (!ultimoLogin || (agoraMs - ultimoLogin) > 10000) {
            ultimosLoginsRegistrados.set(nickChave, agoraMs);
            await registarLogAdmin(user.nickname, 'Login no Sistema', `Utilizador ${user.nickname} efetuou login.`);
        }
        res.json({
            success: true,
            message: 'Login bem-sucedido',
            user: {
                _id: user._id,
                nickname: user.nickname,
                cargo: user.cargo,
                role: user.role,
                status: user.status,
                telefone: user.telefone || ''
            }
        });
    } catch (e) {
        console.error("Erro no login:", e);
        const ehErroBanco = e.name === 'MongoServerSelectionError' || e.name === 'MongoNetworkError' || e.name === 'MongooseError';
        res.status(ehErroBanco ? 503 : 500).json({
            success: false,
            message: ehErroBanco ? 'Falha na conexão com a base de dados MongoDB. Tente novamente mais tarde.' : 'Erro no servidor.'
        });
    }
});

app.post('/api/auth/register', async (req, res) => {
    try {
        const { nickname, senha, password } = req.body;
        const passFinal = senha || password;
        if (!nickname || !passFinal) return res.status(400).json({ success: false, message: 'Preencha o nickname e a senha.' });

        if (mongoose.connection.readyState !== 1) {
            return res.status(503).json({ success: false, message: 'Conexão com a base de dados indisponível no momento. Tente novamente em instantes.' });
        }

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
        console.error("Erro no registro:", error);
        const ehErroBanco = error.name === 'MongoServerSelectionError' || error.name === 'MongoNetworkError' || error.name === 'MongooseError';
        res.status(ehErroBanco ? 503 : 500).json({
            success: false,
            message: ehErroBanco ? 'Falha na conexão com a base de dados MongoDB ao registar conta.' : 'Erro ao registar conta na base de dados.'
        });
    }
});

app.get('/api/membro/perfil/:nickname', async (req, res) => {
    try {
        const parametro = decodeURIComponent(req.params.nickname || '').trim();
        if (!parametro) return res.status(400).json({ success: false, message: 'Identificador do membro não informado.' });

        const conditions = [
            { nickname: new RegExp('^' + escaparRegex(parametro) + '$', 'i') },
            { username: new RegExp('^' + escaparRegex(parametro) + '$', 'i') }
        ];
        if (parametro.match(/^[0-9a-fA-F]{24}$/)) {
            conditions.unshift({ _id: parametro });
        }

        let membro = await User.findOne(
            { $or: conditions },
            'nickname cargo status avatar telefone historicoTurnos.duracao historicoTurnos.data'
        ).lean();

        // Caso o usuário esteja autenticado mas não possua documento salvo, sincroniza automaticamente
        if (!membro) {
            const novoNick = parametro.match(/^[0-9a-fA-F]{24}$/) ? 'Operacional' : parametro;
            const novoDoc = new User({
                nickname: novoNick,
                cargo: 'Privado',
                status: 'ativo'
            });
            await novoDoc.save();
            membro = novoDoc.toObject();
        }

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
        if (mongoose.connection.readyState !== 1) {
            return res.status(503).json({ success: false, message: 'Conexão com a base de dados indisponível no momento. Tente novamente em instantes.' });
        }

        const { id, userId, nickname, novoNickname, username, email, telefone, avatar } = req.body;
        const nickAtual = String(nickname || '').trim();
        const idValido = id || userId;

        const orConditions = [];
        if (idValido && String(idValido).match(/^[0-9a-fA-F]{24}$/)) {
            orConditions.push({ _id: idValido });
        }
        if (nickAtual) {
            orConditions.push({ nickname: new RegExp('^' + escaparRegex(nickAtual) + '$', 'i') });
        }
        if (username) {
            orConditions.push({ username: new RegExp('^' + escaparRegex(username) + '$', 'i') });
        }
        if (email) {
            orConditions.push({ email: new RegExp('^' + escaparRegex(email) + '$', 'i') });
        }

        if (orConditions.length === 0) {
            return res.status(400).json({ success: false, message: 'Identificação do membro não fornecida.' });
        }

        let membro = await User.findOne({ $or: orConditions });

        // Se ainda não existir no banco, cria e sincroniza o documento no ato com senha padrão
        if (!membro) {
            const nickInicial = (novoNickname && novoNickname.trim()) ? novoNickname.trim() : (nickAtual || 'Operacional');
            membro = new User({
                nickname: nickInicial,
                password: 'temp_' + Date.now(),
                cargo: 'Privado',
                status: 'ativo'
            });
            await membro.save();
        }

        const updateData = {};
        let mudouNickname = false;
        let nicknameFinal = membro.nickname;

        const nickCandidato = (novoNickname !== undefined && novoNickname.trim() !== '') ? novoNickname.trim() : '';

        if (nickCandidato && nickCandidato.toLowerCase() !== membro.nickname.toLowerCase()) {
            const regexNickname = /^[a-zA-Z0-9_.\-\s]{2,30}$/;
            if (!regexNickname.test(nickCandidato)) {
                return res.status(400).json({
                    success: false,
                    message: 'O novo nome deve conter entre 2 e 30 caracteres válidos (letras, números, espaços, hífens, pontos ou underlines).'
                });
            }

            const jaExiste = await User.findOne({
                _id: { $ne: membro._id },
                nickname: new RegExp('^' + escaparRegex(nickCandidato) + '$', 'i')
            }).lean();

            if (jaExiste) {
                return res.status(400).json({
                    success: false,
                    message: 'Este novo nome/nickname já está em uso por outro membro da tropa.'
                });
            }

            updateData.nickname = nickCandidato;
            nicknameFinal = nickCandidato;
            mudouNickname = true;
        }

        if (telefone !== undefined) {
            const telLimpo = String(telefone || '').trim();
            updateData.telefone = telLimpo;
            if (telLimpo !== '') {
                registarLogAdmin(nicknameFinal, 'Atualizou Telemóvel / WhatsApp', `Operacional ${nicknameFinal} definiu o número: ${telLimpo}`).catch(() => {});
            }
        }

        if (avatar !== undefined) updateData.avatar = avatar;

        if (Object.keys(updateData).length > 0) {
            await User.updateOne({ _id: membro._id }, { $set: updateData });
        }

        if (mudouNickname) {
            // Sincroniza o nickname desnormalizado nos registros de BatePonto do membro
            try {
                await BatePonto.updateMany(
                    { usuario: membro._id },
                    { $set: { nickname: nicknameFinal } }
                );
            } catch (errBatePonto) {
                console.warn("Aviso ao atualizar nickname no BatePonto:", errBatePonto.message);
            }

            registarLogAdmin(membro.nickname, 'Alteração de Nickname', `Operacional alterou o nome de "${membro.nickname}" para "${nicknameFinal}".`).catch(() => {});
            io.emit('atualizar_status_geral_tropa');
        }

        res.json({
            success: true,
            message: mudouNickname ? `Perfil e nome alterados para "${nicknameFinal}" com sucesso!` : 'Perfil atualizado com sucesso!',
            novoNickname: nicknameFinal,
            telefone: updateData.telefone !== undefined ? updateData.telefone : membro.telefone
        });
    } catch (e) {
        console.error("Erro ao atualizar perfil:", e);
        if (e.code === 11000) {
            const campoDuplicado = Object.keys(e.keyPattern || {})[0] || 'campo';
            return res.status(400).json({
                success: false,
                message: `Conflito de registo: Já existe uma conta com este ${campoDuplicado === 'nickname' ? 'nome/nickname' : campoDuplicado}.`
            });
        }
        if (e.name === 'ValidationError') {
            return res.status(400).json({
                success: false,
                message: 'Dados inválidos: ' + e.message
            });
        }
        const ehErroBanco = e.name === 'MongoServerSelectionError' || e.name === 'MongoNetworkError' || e.name === 'MongooseError';
        res.status(ehErroBanco ? 503 : 500).json({
            success: false,
            message: ehErroBanco ? 'Falha na conexão com o banco de dados MongoDB.' : (e.message || 'Erro ao atualizar perfil.')
        });
    }
});

app.get('/api/membro/historico/:nickname', async (req, res) => {
    try {
        const membro = await User.findOne(
            { nickname: new RegExp('^' + req.params.nickname + '$', 'i') },
            'nickname cargo status emPlantao estadoTurno inicioPlantao segundosAcumulados fotoComprovanteAtiva comprovantesTurnoAtivo historicoTurnos historicoPromocoes historicoSorteios caixaEntrada'
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
                comprovantesTurnoAtivo: membro.comprovantesTurnoAtivo || [],
                ultimoPlantao: ultimoTurno ? `Duração: ${ultimoTurno.duracao} em ${new Date(ultimoTurno.data).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })}` : 'Nenhum plantão registado'
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

        const alertaId = 'acao_' + Date.now();
        const membrosComPush = await User.find({ pushSubscription: { $exists: true, $ne: null } }, '_id pushSubscription').lean();
        const payload = JSON.stringify({
            id: alertaId,
            tag: alertaId,
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
                } catch (err) {
                    // Se a subscription expirou ou foi cancelada no navegador (410/404), remove do banco
                    if (err.statusCode === 410 || err.statusCode === 404) {
                        await User.updateOne({ _id: membro._id }, { $unset: { pushSubscription: 1 } });
                    }
                }
            }
        }

        const notifGeral = {
            titulo: `🚨 ALERTA DE AÇÃO: ${tituloFinal}`,
            mensagem: descricaoFinal,
            data: new Date()
        };
        await User.updateMany(
            {},
            {
                $push: {
                    caixaEntrada: {
                        $each: [notifGeral],
                        $slice: -30
                    }
                }
            }
        );

        io.emit('tocar_alarme_acao', {
            id: alertaId,
            tag: alertaId,
            titulo: tituloFinal,
            descricao: descricaoFinal
        });
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

        const estadoTurnoDestino = estadoTurno || (emPlantao ? 'ativo' : 'parado');
        const ehNovoTurno = (membroAtual.estadoTurno === 'parado' || !membroAtual.estadoTurno) && estadoTurnoDestino === 'ativo';

        // Ao INICIAR um novo plantão (vindo de parado), valida estritamente a janela regulamentar de Brasília (17:00 às 02:00)
        if (ehNovoTurno) {
            const comp = obterComponentesBrasilia(new Date());
            const hora = comp.hora;
            const dentroDoHorario = (hora >= 17 && hora <= 23) || (hora >= 0 && hora < 2);

            if (!dentroDoHorario) {
                return res.status(400).json({
                    success: false,
                    message: 'Horário bloqueado! Plantões só podem ser iniciados no horário regulamentar: das 17:00 até às 02:00 (horário oficial de Brasília / America/Sao_Paulo).'
                });
            }
        }

        const updateData = {
            estadoTurno: estadoTurnoDestino
        };

        if (ehNovoTurno) {
            updateData.comprovantesTurnoAtivo = [];
        }

        // Consolida os segundos acumulados reais respeitando rigorosamente o teto das 02:00
        let segundosConsolidados = Number(membroAtual.segundosAcumulados || 0);
        if (membroAtual.estadoTurno === 'ativo' && membroAtual.inicioPlantao) {
            const diffBanco = calcularSegundosValidosNoHorario(membroAtual.inicioPlantao, Date.now());
            if (diffBanco > 0) segundosConsolidados += diffBanco;
        }
        if (segundosAcumulados !== undefined) {
            const parsed = Math.max(0, parseInt(segundosAcumulados, 10) || 0);
            if (parsed > segundosConsolidados || membroAtual.estadoTurno !== 'ativo') {
                segundosConsolidados = Math.max(segundosConsolidados, parsed);
            }
        }

        if (estadoTurnoDestino === 'parado') {
            updateData.emPlantao = false;
            updateData.inicioPlantao = null;
            updateData.segundosAcumulados = 0;
            updateData.fotoComprovanteAtiva = '';
        } else if (estadoTurnoDestino === 'pausado') {
            updateData.emPlantao = true;
            updateData.inicioPlantao = null; // Interrompe o relógio contínuo, preservando segundos acumulados
            updateData.segundosAcumulados = segundosConsolidados;
            if (fotoComprovanteAtiva !== undefined) {
                updateData.fotoComprovanteAtiva = fotoComprovanteAtiva;
            }
        } else if (estadoTurnoDestino === 'ativo') {
            updateData.emPlantao = true;
            if (inicioPlantao) {
                updateData.inicioPlantao = new Date(inicioPlantao);
            } else if (!membroAtual.inicioPlantao) {
                updateData.inicioPlantao = new Date();
            }

            // Preserva e consolida os segundos acumulados pré-existentes ao retomar da pausa
            updateData.segundosAcumulados = segundosConsolidados;

            if (fotoComprovanteAtiva !== undefined) {
                updateData.fotoComprovanteAtiva = fotoComprovanteAtiva;
            }
        }

        try {
            await User.updateOne(
                { _id: membroAtual._id },
                { $set: updateData }
            );
        } catch (errUpdate) {
            // Se estourar os 16MB (código 10334 ou BSONObj size), executa expurgo atômico e conclui imediatamente sem travar
            if (errUpdate.code === 10334 || String(errUpdate.message).includes('16793600') || String(errUpdate.message).includes('BSONObj size')) {
                console.warn(`[Documento > 16MB] Purga imediata executada para ${membroAtual.nickname}...`);
                await limparDocumentoUsuarioSobrecarga(membroAtual._id);
                if (updateData.fotoComprovanteAtiva && updateData.fotoComprovanteAtiva.length > 150000) {
                    updateData.fotoComprovanteAtiva = 'Comprovante consolidado';
                }
                await User.updateOne(
                    { _id: membroAtual._id },
                    { $set: updateData }
                );
            } else {
                throw errUpdate;
            }
        }

        // Ao dar check-in, registra a presença na etapa no BatePonto imediatamente
        if (ehNovoTurno) {
            try {
                const dataInicioRef = updateData.inicioPlantao || new Date();
                const etapaDeterminada = obterEtapaHorarioBrasilia(dataInicioRef) || 1;
                const dataCiclo = obterDataCicloBrasil(dataInicioRef.getTime());
                await BatePonto.findOneAndUpdate(
                    { usuario: membroAtual._id, data: dataCiclo, etapa: etapaDeterminada },
                    {
                        $set: {
                            nickname: membroAtual.nickname,
                            status: 'presente',
                            fotoComprovante: updateData.fotoComprovanteAtiva || membroAtual.fotoComprovanteAtiva || '',
                            emAndamento: true,
                            dataRegistro: new Date()
                        },
                        $setOnInsert: {
                            duracao: '00:00:00',
                            segundosTotais: 0
                        }
                    },
                    { upsert: true, returnDocument: 'after' }
                );
            } catch (errBatePonto) {
                console.error("Aviso ao persistir check-in no BatePonto:", errBatePonto.message);
            }
        } else if (estadoTurnoDestino === 'pausado') {
            // Ao pausar, consolida o tempo acumulado no registro correspondente do BatePonto
            try {
                const etapaDeterminada = obterEtapaHorarioBrasilia() || 1;
                const dataCiclo = obterDataCicloBrasil();
                const duracaoConsolidada = converterSegundosParaDuracao(segundosConsolidados);
                await BatePonto.findOneAndUpdate(
                    { usuario: membroAtual._id, data: dataCiclo, etapa: etapaDeterminada },
                    {
                        $set: {
                            nickname: membroAtual.nickname,
                            status: 'presente',
                            duracao: duracaoConsolidada,
                            segundosTotais: segundosConsolidados,
                            fotoComprovante: updateData.fotoComprovanteAtiva || membroAtual.fotoComprovanteAtiva || '',
                            emAndamento: false,
                            dataRegistro: new Date()
                        }
                    },
                    { upsert: true, returnDocument: 'after' }
                );
            } catch (errBatePonto) {
                console.error("Aviso ao consolidar pausa no BatePonto:", errBatePonto.message);
            }
        } else if (membroAtual.estadoTurno === 'pausado' && estadoTurnoDestino === 'ativo') {
            // Ao retomar, marca o ponto como em andamento novamente
            try {
                const etapaDeterminada = obterEtapaHorarioBrasilia() || 1;
                const dataCiclo = obterDataCicloBrasil();
                await BatePonto.findOneAndUpdate(
                    { usuario: membroAtual._id, data: dataCiclo, etapa: etapaDeterminada },
                    {
                        $set: {
                            nickname: membroAtual.nickname,
                            status: 'presente',
                            fotoComprovante: updateData.fotoComprovanteAtiva || membroAtual.fotoComprovanteAtiva || '',
                            emAndamento: true,
                            dataRegistro: new Date()
                        }
                    },
                    { upsert: true, returnDocument: 'after' }
                );
            } catch (errBatePonto) {
                console.error("Aviso ao atualizar retomada no BatePonto:", errBatePonto.message);
            }
        }

        io.emit('atualizar_estado_turno_usuario', { nickname: String(nickname).toLowerCase().trim() });
        io.emit('atualizar_status_geral_tropa');

        res.json({
            success: true,
            message: 'Estado do turno sincronizado com sucesso!',
            estado: updateData
        });
    } catch (e) {
        console.error("Erro ao atualizar status-plantao:", e);
        const ehTamanhoBson = e.code === 10334 || String(e.message).includes('16793600') || String(e.message).includes('BSONObj size');
        res.status(ehTamanhoBson ? 413 : 500).json({
            success: false,
            message: ehTamanhoBson
                ? 'Limite de armazenamento do documento excedido. A purga automática foi ativada, tente novamente.'
                : (e.message || 'Erro ao atualizar status do turno na conta.')
        });
    }
});

// --- REGISTO DE PRINT DE VERIFICAÇÃO DE 1 HORA (60 MINUTOS) ---
app.post('/api/membro/turno/verificacao-hora', async (req, res) => {
    try {
        const { nickname, fotoComprovante, horaNumero, segundosDecorridos } = req.body;
        if (!nickname || !fotoComprovante) {
            return res.status(400).json({ success: false, message: 'Nickname e comprovante são obrigatórios.' });
        }

        const membro = await User.findOne(
            { nickname: new RegExp('^' + String(nickname).trim() + '$', 'i') },
            '_id nickname estadoTurno'
        );
        if (!membro) return res.status(404).json({ success: false, message: 'Membro não encontrado.' });

        const novoRegistroVerificacao = {
            data: new Date(),
            horaNumero: parseInt(horaNumero, 10) || 1,
            segundosDecorridos: parseInt(segundosDecorridos, 10) || 3600,
            fotoComprovante: fotoComprovante
        };

        await User.updateOne(
            { _id: membro._id },
            {
                $push: {
                    comprovantesTurnoAtivo: {
                        $each: [novoRegistroVerificacao],
                        $slice: -10
                    }
                },
                $set: { fotoComprovanteAtiva: fotoComprovante }
            }
        );

        await registarLogAdmin(
            membro.nickname,
            'Verificação de Turno (1h)',
            `Comprovante de presença da ${novoRegistroVerificacao.horaNumero}ª hora de turno anexado com sucesso.`
        );

        res.json({
            success: true,
            message: `Verificação de presença da ${novoRegistroVerificacao.horaNumero}ª hora validada com sucesso!`,
            verificacao: novoRegistroVerificacao
        });
    } catch (e) {
        console.error("Erro ao registrar verificação de hora:", e);
        res.status(500).json({ success: false, message: 'Erro ao registrar verificação de presença.' });
    }
});

// --- ROTA DE CHECK-OUT E REGISTO DE TURNO (INTEGRADA COM BATEPONTO) ---
app.post('/api/membro/turno', async (req, res) => {
    try {
        const { nickname, duracao, segundosTotais, fotoComprovante, comprovantesVerificacao } = req.body;
        if (!nickname) return res.status(400).json({ success: false, message: 'Nickname não fornecido.' });

        const membroDoc = await User.findOne(
            { nickname: new RegExp('^' + String(nickname).trim() + '$', 'i') },
            '_id nickname cargo estadoTurno inicioPlantao segundosAcumulados fotoComprovanteAtiva comprovantesTurnoAtivo'
        );
        if (!membroDoc) return res.status(404).json({ success: false, message: 'Membro não encontrado.' });

        let segundosFinais = parseInt(segundosTotais, 10) || 0;

        // Calcula tempo real acumulado com base no estado salvo no servidor, limitado estritamente até 02:00:00
        let segundosBanco = Number(membroDoc.segundosAcumulados || 0);
        if (membroDoc.estadoTurno === 'ativo' && membroDoc.inicioPlantao) {
            const diffBanco = calcularSegundosValidosNoHorario(membroDoc.inicioPlantao, Date.now());
            if (diffBanco > 0) segundosBanco += diffBanco;
        }

        // Se o valor do servidor for mais completo ou o cliente não enviou, utiliza o tempo real
        if (segundosFinais <= 0 || (segundosBanco > 0 && segundosBanco > segundosFinais)) {
            segundosFinais = segundosBanco;
        }

        if (segundosFinais <= 0 && duracao) {
            segundosFinais = converterDuracaoParaSegundos(duracao);
        }

        if (segundosFinais < 5) {
            segundosFinais = 5;
        }

        const duracaoFormatada = converterSegundosParaDuracao(segundosFinais);
        const comprovanteFinal = (fotoComprovante && String(fotoComprovante).trim() !== '')
            ? fotoComprovante
            : (membroDoc.fotoComprovanteAtiva || 'Comprovante Padrão / Validado');

        const listaComprovantes = Array.isArray(comprovantesVerificacao) && comprovantesVerificacao.length > 0
            ? comprovantesVerificacao
            : (Array.isArray(membroDoc.comprovantesTurnoAtivo) ? membroDoc.comprovantesTurnoAtivo : []);

        const novoTurno = {
            data: new Date(),
            duracao: duracaoFormatada,
            fotoComprovante: comprovanteFinal,
            comprovantesVerificacao: listaComprovantes
        };

        // 1. Atualiza no User com histórico controlado por $slice para evitar estouro de 16MB
        try {
            await User.updateOne(
                { _id: membroDoc._id },
                {
                    $push: {
                        historicoTurnos: {
                            $each: [novoTurno],
                            $slice: -60
                        }
                    },
                    $set: {
                        emPlantao: false,
                        estadoTurno: 'parado',
                        inicioPlantao: null,
                        segundosAcumulados: 0,
                        fotoComprovanteAtiva: '',
                        comprovantesTurnoAtivo: []
                    }
                }
            );
        } catch (errTurnoUser) {
            if (errTurnoUser.code === 10334 || String(errTurnoUser.message).includes('16793600') || String(errTurnoUser.message).includes('BSONObj size')) {
                await limparDocumentoUsuarioSobrecarga(membroDoc._id);
                await User.updateOne(
                    { _id: membroDoc._id },
                    {
                        $push: {
                            historicoTurnos: {
                                $each: [novoTurno],
                                $slice: -60
                            }
                        },
                        $set: {
                            emPlantao: false,
                            estadoTurno: 'parado',
                            inicioPlantao: null,
                            segundosAcumulados: 0,
                            fotoComprovanteAtiva: '',
                            comprovantesTurnoAtivo: []
                        }
                    }
                );
            } else {
                throw errTurnoUser;
            }
        }

        // 2. Persiste e acumula no modelo BatePonto na etapa regulamentar
        const dataInicioRef = membroDoc.inicioPlantao ? new Date(membroDoc.inicioPlantao) : new Date();
        const etapaDeterminada = obterEtapaHorarioBrasilia(dataInicioRef) || obterEtapaHorarioBrasilia(new Date()) || 1;
        const dataCiclo = obterDataCicloBrasil(dataInicioRef.getTime());

        try {
            const pontoExistente = await BatePonto.findOne({ usuario: membroDoc._id, data: dataCiclo, etapa: etapaDeterminada });
            let segundosTotaisEtapa = segundosFinais;
            if (pontoExistente && pontoExistente.segundosTotais && !pontoExistente.emAndamento) {
                segundosTotaisEtapa += pontoExistente.segundosTotais;
            }
            const duracaoEtapaFormatada = converterSegundosParaDuracao(segundosTotaisEtapa);

            await BatePonto.findOneAndUpdate(
                { usuario: membroDoc._id, data: dataCiclo, etapa: etapaDeterminada },
                {
                    $set: {
                        nickname: membroDoc.nickname,
                        status: 'presente',
                        duracao: duracaoEtapaFormatada,
                        segundosTotais: segundosTotaisEtapa,
                        fotoComprovante: comprovanteFinal,
                        emAndamento: false,
                        dataRegistro: new Date()
                    }
                },
                { upsert: true, returnDocument: 'after' }
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
// --- LISTA GERAL DE SALDOS E CARTEIRAS PARA O PAINEL ADM ---
app.get('/api/admin/carteiras', async (req, res) => {
    try {
        const membros = await User.find({}, 'nickname cargo status carteiraSaldo').lean();
        const lista = membros.map(m => ({
            _id: m._id,
            nickname: m.nickname,
            cargo: m.cargo || 'Privado',
            status: m.status || 'ativo',
            saldo: typeof m.carteiraSaldo === 'number' ? m.carteiraSaldo : 0
        }));

        // Ordena por maior saldo primeiro
        lista.sort((a, b) => b.saldo - a.saldo);

        const totalAcumuladoGeral = lista.reduce((acc, curr) => acc + curr.saldo, 0);

        res.json({
            success: true,
            totalAcumuladoGeral,
            totalMembros: lista.length,
            carteiras: lista
        });
    } catch (e) {
        console.error("Erro ao listar carteiras:", e);
        res.status(500).json({ success: false, message: 'Erro ao carregar lista de carteiras.' });
    }
});

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
            { $set: { carteiraSaldo: 0 } }
        );

        // Notificação individual exclusiva de pagamento para o membro beneficiado
        await enviarNotificacaoMembro(membro._id, {
            titulo: '💰 Pagamento de Saldo Efetuado!',
            mensagem: `O Comando efetuou o pagamento do seu saldo acumulado de <b>R$ ${saldoPago.toLocaleString('pt-BR')}</b>. A carteira foi reiniciada para R$ 0,00.`,
            tag: 'pagamento_carteira_' + Date.now(),
            url: '/dashboard.html'
        });

        io.emit('atualizar_status_geral_tropa');
        await registarLogAdmin(adminNickname || 'Comando', 'Pagamento de Carteira', `Efetuado pagamento de R$ ${saldoPago} para ${membro.nickname} e saldo zerado.`);

        res.json({ success: true, message: `Pagamento registado e carteira de ${membro.nickname} zerada com sucesso!` });
    } catch (e) {
        res.status(500).json({ success: false, message: 'Erro ao processar pagamento.' });
    }
});

// --- ROTAS DE CONFIGURAÇÃO DE HORAS PARA PROVAS (SARGENTO, TENENTE, MAJOR) ---
async function obterConfigHorasProvas() {
    let config = await ConfigSorteio.collection.findOne({ chave: 'config_provas_horas' });
    if (!config) {
        return { sargento: 10, tenente: 30, major: 50 };
    }
    return {
        sargento: typeof config.sargento === 'number' ? config.sargento : 10,
        tenente: typeof config.tenente === 'number' ? config.tenente : 30,
        major: typeof config.major === 'number' ? config.major : 50
    };
}

app.get('/api/admin/config/provas-horas', async (req, res) => {
    try {
        const horas = await obterConfigHorasProvas();
        res.json({ success: true, ...horas });
    } catch (e) {
        console.error("Erro ao buscar configuração de horas das provas:", e);
        res.json({ success: true, sargento: 10, tenente: 30, major: 50 });
    }
});

app.post('/api/admin/config/provas-horas', async (req, res) => {
    try {
        const { adminNickname, sargento, tenente, major } = req.body;

        const valSarg = Math.max(1, parseInt(sargento, 10) || 10);
        const valTen = Math.max(1, parseInt(tenente, 10) || 30);
        const valMaj = Math.max(1, parseInt(major, 10) || 50);

        if (adminNickname) {
            const adminUser = await User.findOne({ nickname: new RegExp('^' + adminNickname + '$', 'i') }, 'role cargo').lean();
            const cargoAdmin = adminUser ? (adminUser.cargo || '') : '';
            const ehAdminValido = adminUser && (adminUser.role === 'admin' || cargoAdmin === 'General' || cargoAdmin === 'Coronel All');
            if (!ehAdminValido) {
                return res.status(403).json({ success: false, message: 'Acesso negado. Apenas o Comando Superior pode alterar as horas das provas.' });
            }
        }

        await ConfigSorteio.collection.updateOne(
            { chave: 'config_provas_horas' },
            {
                $set: {
                    chave: 'config_provas_horas',
                    sargento: valSarg,
                    tenente: valTen,
                    major: valMaj,
                    atualizadoPor: adminNickname || 'Comando',
                    data: new Date()
                }
            },
            { upsert: true }
        );

        await registarLogAdmin(
            adminNickname || 'Comando',
            'Configurou Horas de Exame',
            `Horas exigidas: Sargento (${valSarg}h), Tenente (${valTen}h), Major (${valMaj}h)`
        );

        res.json({
            success: true,
            message: 'Horas mínimas para exames salvas com sucesso!',
            horas: { sargento: valSarg, tenente: valTen, major: valMaj }
        });
    } catch (e) {
        console.error("Erro ao salvar horas das provas:", e);
        res.status(500).json({ success: false, message: 'Erro ao salvar horas de provas.' });
    }
});

// --- ROTAS DE CONFIGURAÇÃO DE PREMIAÇÃO DA TROPA (1º, 2º E 3º LUGAR) ---
app.get('/api/admin/config/premiacao-tropa', async (req, res) => {
    try {
        const config = await ConfigSorteio.collection.findOne({ chave: 'premiacao_tropa' });
        res.json({
            success: true,
            primeiro: config && typeof config.primeiro === 'number' ? config.primeiro : 25000,
            segundo: config && typeof config.segundo === 'number' ? config.segundo : 15000,
            terceiro: config && typeof config.terceiro === 'number' ? config.terceiro : 10000
        });
    } catch (e) {
        console.error("Erro ao carregar configuração de premiação da tropa:", e);
        res.json({ success: true, primeiro: 25000, segundo: 15000, terceiro: 10000 });
    }
});

app.post('/api/admin/config/premiacao-tropa', async (req, res) => {
    try {
        const { adminNickname, primeiro, segundo, terceiro } = req.body;

        const val1 = Math.max(0, parseInt(primeiro, 10) || 0);
        const val2 = Math.max(0, parseInt(segundo, 10) || 0);
        const val3 = Math.max(0, parseInt(terceiro, 10) || 0);

        if (adminNickname) {
            const adminUser = await User.findOne({ nickname: new RegExp('^' + adminNickname + '$', 'i') }, 'role cargo').lean();
            const cargoAdmin = adminUser ? (adminUser.cargo || '') : '';
            const ehAdminValido = adminUser && (adminUser.role === 'admin' || cargoAdmin === 'General' || cargoAdmin === 'Coronel All');
            if (!ehAdminValido) {
                return res.status(403).json({ success: false, message: 'Acesso negado. Apenas o Comando Superior pode alterar as premiações.' });
            }
        }

        await ConfigSorteio.collection.updateOne(
            { chave: 'premiacao_tropa' },
            {
                $set: {
                    chave: 'premiacao_tropa',
                    primeiro: val1,
                    segundo: val2,
                    terceiro: val3,
                    atualizadoPor: adminNickname || 'Comando',
                    data: new Date()
                }
            },
            { upsert: true }
        );

        await registarLogAdmin(
            adminNickname || 'Comando',
            'Configurou Premiação da Tropa',
            `Novas premiações: 1º R$ ${val1.toLocaleString('pt-BR')} | 2º R$ ${val2.toLocaleString('pt-BR')} | 3º R$ ${val3.toLocaleString('pt-BR')}`
        );

        io.emit('atualizar_premiacao_tropa', { primeiro: val1, segundo: val2, terceiro: val3 });
        io.emit('atualizar_status_geral_tropa');

        res.json({
            success: true,
            message: 'Premiações da tropa atualizadas com sucesso!',
            premios: { primeiro: val1, segundo: val2, terceiro: val3 }
        });
    } catch (e) {
        console.error("Erro ao salvar premiação da tropa:", e);
        res.status(500).json({ success: false, message: 'Erro ao salvar premiações da tropa.' });
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
            // Mantém no máximo as últimas 30 missões no documento para controlar tamanho
            if (membro.historicoMissoes.length > 30) {
                membro.historicoMissoes = membro.historicoMissoes.slice(-30);
            }
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
            const membrosAtivos = await User.find(
                { $or: [{ emPlantao: true }, { estadoTurno: { $in: ['ativo', 'pausado'] } }] },
                'nickname cargo emPlantao estadoTurno inicioPlantao segundosAcumulados fotoComprovanteAtiva'
            ).lean();
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

            // Notificação individual exclusiva para o membro promovido/alterado
            await enviarNotificacaoMembro(membro._id, {
                titulo: `⭐ ${acaoStr}!`,
                mensagem: `O teu cargo foi atualizado de <b>${membroAntigo.cargo}</b> para <b>${cargo}</b> por ${nomeAutor}.`,
                tag: 'promocao_' + Date.now(),
                url: '/dashboard.html'
            });
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

        const configHoras = await obterConfigHorasProvas();
        const cargoAtual = membro.cargo || 'Privado';
        let provaDisponivelPara = null;
        let horasNecessarias = 0;

        if (cargoAtual === 'Soldado' || cargoAtual === 'Privado') {
            horasNecessarias = configHoras.sargento;
            if (totalHoras >= configHoras.sargento) provaDisponivelPara = 'Sargento';
        } else if (cargoAtual === 'Sargento') {
            horasNecessarias = configHoras.tenente;
            if (totalHoras >= configHoras.tenente) provaDisponivelPara = 'Tenente';
        } else if (cargoAtual === 'Tenente') {
            horasNecessarias = configHoras.major;
            if (totalHoras >= configHoras.major) provaDisponivelPara = 'Major';
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

        // Gabaritos oficiais com dificuldade progressiva por cargo conforme regras do EB
        let gabarito = {};
        if (cargoAlvo === 'Sargento') {
            // Nível Básico: Autorização prévia, proibição de famílias, proibição teaser/cassetete (FAIL - 4.22)
            gabarito = { q1: 'b', q2: 'a', q3: 'b' };
        } else if (cargoAlvo === 'Tenente') {
            // Nível Intermediário: Antecedência de 24h, horários terça/quinta com pausa 22h-23h, spawn/redores (AAP - 4.17)
            gabarito = { q1: 'c', q2: 'b', q3: 'c', q4: 'a' };
        } else if (cargoAlvo === 'Major') {
            // Nível Avançado: Pacificação sábado vs dom/seg, inatividade 24h/12h às 00h, roubo de maleta e INA - 4.21
            gabarito = { q1: 'a', q2: 'c', q3: 'b', q4: 'c' };
        } else {
            gabarito = { q1: 'a', q2: 'b', q3: 'b' };
        }

        let totalPerguntas = Object.keys(gabarito).length;
        let acertos = 0;
        for (const [chave, respEsperada] of Object.entries(gabarito)) {
            if (respostas && String(respostas[chave]).toLowerCase() === respEsperada) {
                acertos++;
            }
        }

        const aprovado = (acertos / totalPerguntas) >= 0.75;

        if (aprovado) {
            await User.updateOne(
                { _id: membro._id },
                {
                    $set: { cargo: cargoAlvo, cooldownProvaAte: null },
                    $push: {
                        historicoPromocoes: { novoCargo: cargoAlvo, cargoAnterior: membro.cargo, data: new Date() }
                    }
                }
            );

            // Notificação individual exclusiva de aprovação no exame
            await enviarNotificacaoMembro(membro._id, {
                titulo: '🎉 Aprovado no Exame Oficial!',
                mensagem: `Parabéns! Foste aprovado no exame e promovido a <b>${cargoAlvo}</b>!`,
                tag: 'aprovado_prova_' + Date.now(),
                url: '/dashboard.html'
            });

            io.emit('atualizar_status_geral_tropa');
            io.emit('atualizar_cargo_usuario', { nickname: nickname.toLowerCase(), novoCargo: cargoAlvo });
            await registarLogAdmin(nickname, 'Aprovação em Exame', `Membro aprovado em exame e promovido a ${cargoAlvo}.`);
            res.json({ success: true, aprovado: true, message: `Parabéns! Passaste na prova e foste promovido a ${cargoAlvo}!` });
        } else {
            const dataCooldown = new Date();
            dataCooldown.setHours(dataCooldown.getHours() + 24);
            await User.updateOne({ _id: membro._id }, { $set: { cooldownProvaAte: dataCooldown } });

            await enviarNotificacaoMembro(membro._id, {
                titulo: '📝 Resultado do Exame',
                mensagem: `Exame finalizado com ${acertos}/${totalPerguntas} acertos. Novo teste disponível em 24h.`,
                tag: 'resultado_prova_' + Date.now(),
                url: '/dashboard.html'
            });

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
        const novoConfig = {
            chave: 'sorteio_ativo',
            ganhadoresCiclo: [],
            dataUltimoReset: null,
            dataUltimoResetUmTurno: null,
            cicloReset: obterDataCicloBrasil()
        };
        await ConfigSorteio.collection.updateOne(
            { chave: 'sorteio_ativo' },
            { $set: novoConfig },
            { upsert: true }
        );
        return novoConfig;
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
    const cicloAtual = obterDataCicloBrasil();

    // Se o corte foi feito no mesmo ciclo operacional, respeita o timestamp do reset persistido
    let dataCorte = null;
    if (config.dataUltimoReset && config.cicloReset === cicloAtual) {
        dataCorte = new Date(config.dataUltimoReset).getTime();
    }

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
          const tempoTurno = new Date(t.data).getTime();
          if (dataCorte && tempoTurno <= dataCorte) continue;
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
        const agora = new Date();
        const cicloAtual = obterDataCicloBrasil();

        await ConfigSorteio.collection.updateOne(
            { chave: 'sorteio_ativo' },
            {
                $set: {
                    chave: 'sorteio_ativo',
                    dataUltimoReset: agora,
                    cicloReset: cicloAtual
                }
            },
            { upsert: true }
        );

        io.emit('atualizar_status_geral_tropa');
        await registarLogAdmin(adminNickname || 'Comando', 'Reset de Elegíveis (2h+)', `Lista de elegíveis resetada com persistência por ${adminNickname || 'Comando'}.`);
        res.json({ success: true, message: 'Elegíveis de 2h+ resetados com sucesso no banco de dados!' });
    } catch (e) {
        res.status(500).json({ success: false, message: 'Erro ao resetar elegíveis: ' + e.message });
    }
}

app.post('/api/admin/sorteio/resetar-ciclo', async (req, res) => {
    try {
        const { adminNickname } = req.body || {};
        const agora = new Date();
        const cicloAtual = obterDataCicloBrasil();

        await ConfigSorteio.collection.updateOne(
            { chave: 'sorteio_ativo' },
            {
                $set: {
                    chave: 'sorteio_ativo',
                    ganhadoresCiclo: [],
                    dataUltimoReset: agora,
                    dataUltimoResetUmTurno: agora,
                    cicloReset: cicloAtual
                }
            },
            { upsert: true }
        );

        io.emit('atualizar_status_geral_tropa');
        await registarLogAdmin(adminNickname || 'Comando', 'Reset Geral de Sorteio', `Ciclo e ganhadores zerados por ${adminNickname || 'Comando'}.`);
        res.json({ success: true, message: 'Ciclo completo de sorteio resetado com sucesso!' });
    } catch (e) {
        res.status(500).json({ success: false, message: 'Erro ao resetar ciclo: ' + e.message });
    }
});

app.post('/api/admin/sorteio/resetar-elegiveis', executarResetCiclo);

app.post('/api/admin/sorteio/resetar-elegiveis-um-turno', async (req, res) => {
    try {
        const { adminNickname } = req.body || {};
        const agora = new Date();
        const cicloAtual = obterDataCicloBrasil();

        await ConfigSorteio.collection.updateOne(
            { chave: 'sorteio_ativo' },
            {
                $set: {
                    dataUltimoResetUmTurno: agora,
                    cicloResetUmTurno: cicloAtual
                }
            },
            { upsert: true }
        );

        io.emit('atualizar_status_geral_tropa');
        await registarLogAdmin(adminNickname || 'Comando', 'Reset de Elegíveis (1 Turno)', `Lista de elegíveis de 1 turno resetada no banco por ${adminNickname || 'Comando'}.`);
        res.json({ success: true, message: 'Elegíveis de 1 turno resetados com sucesso no banco de dados!' });
    } catch (e) {
        res.status(500).json({ success: false, message: 'Erro ao resetar elegíveis de 1 turno: ' + e.message });
    }
});

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

    // Se o prêmio for monetário (ex: R$ 50.000), credita na carteira digital do ganhador
    const matchValorPremio = String(premioSorteado).replace(/\./g, '').match(/R?\$?\s*(\d+)/i);
    let valorMonetarioAdicionado = 0;
    if (matchValorPremio && matchValorPremio[1]) {
        valorMonetarioAdicionado = parseInt(matchValorPremio[1], 10) || 0;
    }

    const updateGanhador = {
        $push: {
            historicoSorteios: { premio: premioSorteado, data: new Date() },
            caixaEntrada: {
                titulo: '🏆 Vencedor da Roleta Oficial!',
                mensagem: `Parabéns! Foste sorteado na roleta oficial de 2h e ganhaste: <b>${premioSorteado}</b>!`,
                data: new Date()
            }
        }
    };

    if (valorMonetarioAdicionado > 0) {
        updateGanhador.$inc = { carteiraSaldo: valorMonetarioAdicionado };
    }

    await User.updateOne({ _id: vencedor._id }, updateGanhador);

    // Dispara Web Push limpo e exclusivo para o vencedor se possuir subscription ativa
    try {
        const ganhadorComPush = await User.findById(vencedor._id, 'pushSubscription').lean();
        if (ganhadorComPush && ganhadorComPush.pushSubscription && ganhadorComPush.pushSubscription.endpoint) {
            const pushPayload = JSON.stringify({
                id: 'sorteio_vencedor_' + Date.now(),
                tag: 'sorteio_vencedor',
                title: '🏆 PARABÉNS! VOCÊ FOI SORTEADO!',
                body: `Você venceu a roleta oficial e ganhou: ${premioSorteado}!`,
                url: '/dashboard.html'
            });
            webpush.sendNotification(ganhadorComPush.pushSubscription, pushPayload).catch(async (err) => {
                if (err.statusCode === 410 || err.statusCode === 404) {
                    await User.updateOne({ _id: vencedor._id }, { $unset: { pushSubscription: 1 } });
                }
            });
        }
    } catch (ePush) {
        console.warn("Aviso ao enviar push ao ganhador:", ePush.message);
    }

    io.emit('girar_roleta_ao_vivo', {
        participantes: participantesNomes,
        vencedor: vencedor.nickname,
        cargoVencedor: vencedor.cargo || 'Privado',
        indiceVencedor: indiceVencedor,
        premio: premioSorteado
    });

    io.emit('vencedor_sorteio_notificacao', {
        nickname: vencedor.nickname,
        premio: premioSorteado,
        modalidade: 'Roleta Oficial (2h+)'
    });
    io.emit('atualizar_status_geral_tropa');

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
    const cicloAtual = obterDataCicloBrasil();

    let dataCorte = null;
    if (config.dataUltimoResetUmTurno && config.cicloResetUmTurno === cicloAtual) {
        dataCorte = new Date(config.dataUltimoResetUmTurno).getTime();
    }

    const membros = await User.find(
        { 'historicoTurnos.0': { $exists: true } },
        'nickname cargo historicoTurnos.data historicoTurnos.manual'
    ).lean();

    const elegiveis = membros.filter(m => {
      const nicknameLower = m.nickname.toLowerCase().trim();
      if (ganhadoresCiclo.includes(nicknameLower)) return false;

      return (m.historicoTurnos || []).some(t => {
          const tempoTurno = new Date(t.data).getTime();
          if (dataCorte && tempoTurno <= dataCorte) return false;
          return turnoPertenceAoCicloAtual(t);
      });
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

    // Se o prêmio for monetário, credita na carteira digital do ganhador
    const matchValorPremio1T = String(premioSorteado).replace(/\./g, '').match(/R?\$?\s*(\d+)/i);
    let valorMonetario1T = 0;
    if (matchValorPremio1T && matchValorPremio1T[1]) {
        valorMonetario1T = parseInt(matchValorPremio1T[1], 10) || 0;
    }

    const updateGanhador1T = {
        $push: {
            historicoSorteios: { premio: premioSorteado, data: new Date() },
            caixaEntrada: {
                titulo: '🏆 Vencedor da Roleta (1 Turno Hoje)!',
                mensagem: `Parabéns! Foste sorteado na roleta diária de 1 turno e ganhaste: <b>${premioSorteado}</b>!`,
                data: new Date()
            }
        }
    };

    if (valorMonetario1T > 0) {
        updateGanhador1T.$inc = { carteiraSaldo: valorMonetario1T };
    }

    await User.updateOne({ _id: vencedor._id }, updateGanhador1T);

    // Envia Web Push para o vencedor se ativo
    try {
        const ganhadorComPush = await User.findById(vencedor._id, 'pushSubscription').lean();
        if (ganhadorComPush && ganhadorComPush.pushSubscription && ganhadorComPush.pushSubscription.endpoint) {
            const pushPayload = JSON.stringify({
                id: 'sorteio_1turno_' + Date.now(),
                tag: 'sorteio_vencedor',
                title: '🏆 PARABÉNS! VOCÊ FOI SORTEADO!',
                body: `Você venceu o sorteio diário de 1 turno e ganhou: ${premioSorteado}!`,
                url: '/dashboard.html'
            });
            webpush.sendNotification(ganhadorComPush.pushSubscription, pushPayload).catch(async (err) => {
                if (err.statusCode === 410 || err.statusCode === 404) {
                    await User.updateOne({ _id: vencedor._id }, { $unset: { pushSubscription: 1 } });
                }
            });
        }
    } catch (ePush) {
        console.warn("Aviso ao enviar push ao ganhador de 1 turno:", ePush.message);
    }

    io.emit('vencedor_sorteio_notificacao', {
        nickname: vencedor.nickname,
        premio: premioSorteado,
        modalidade: 'Sorteio de 1 Turno'
    });
    io.emit('atualizar_status_geral_tropa');

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
    let salaVozId = (data && data.salaId) ? data.salaId : 'sala_geral_salazar';
    socket.join(salaVozId);
    socket.nicknameVoz = (data && data.nickname) ? data.nickname : 'Operacional';
    socket.cargoVoz = (data && data.cargo) ? data.cargo : 'Privado';
    socket.salaVozId = salaVozId;

    const lista = obterUtilizadoresVoz(salaVozId);
    io.emit('utilizadores_no_voz', { salaId: salaVozId, usuarios: lista });
  });

  socket.on('obter_participantes_voz', (data) => {
    let salaVozId = (data && data.salaId) ? data.salaId : 'sala_geral_salazar';
    socket.emit('utilizadores_no_voz', { salaId: salaVozId, usuarios: obterUtilizadoresVoz(salaVozId) });
  });

  socket.on('sinal_WebRTC', (data) => {
    if (data && data.to) {
      io.to(data.to).emit('sinal_WebRTC', { from: socket.id, signal: data.signal });
    }
  });

  socket.on('admin_mutar_membro', ({ targetSocketId, mutado }) => {
    io.to(targetSocketId).emit('forcar_mute_servidor', { mutado });
  });

  socket.on('sair_canal_voz', () => {
    if (socket.salaVozId) {
      const sala = socket.salaVozId;
      socket.leave(sala);
      socket.salaVozId = null;
      socket.nicknameVoz = null;
      socket.cargoVoz = null;
      io.emit('utilizadores_no_voz', { salaId: sala, usuarios: obterUtilizadoresVoz(sala) });
    }
  });

  socket.on('disconnect', () => {
    const user = usuariosOnline[socket.id];
    if (user) {
      delete usuariosOnline[socket.id];
      atualizarEstadoOperacional(user.salaId);
    }

    if (socket.salaVozId) {
      const sala = socket.salaVozId;
      socket.leave(sala);
      socket.salaVozId = null;
      socket.nicknameVoz = null;
      socket.cargoVoz = null;
      io.emit('utilizadores_no_voz', { salaId: sala, usuarios: obterUtilizadoresVoz(sala) });
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
          lista.push({ id: s.id, nickname: s.nicknameVoz, cargo: s.cargoVoz || 'Privado' });
      }
  }
  return lista;
}

// Endpoint para consulta imediata de quem está no canal de voz sem depender de eventos passados
app.get('/api/voz/participantes/:salaId', (req, res) => {
  const salaId = req.params.salaId || 'sala_geral_salazar';
  res.json({ success: true, salaId, usuarios: obterUtilizadoresVoz(salaId) });
});

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
