const fs = require('fs');
const path = require('path');
const Log = require('../models/Log');

// Garante que a pasta de logs física existe
const logDir = path.join(__dirname, '../logs');
if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir);
}

const logger = {
    info: async (msg, meta = {}) => registrar('info', msg, meta),
    warn: async (msg, meta = {}) => registrar('warning', msg, meta),
    error: async (msg, meta = {}) => registrar('error', msg, meta),
    auth: async (msg, meta = {}) => registrar('auth', msg, meta)
};

async function registrar(nivel, mensagem, detalhes) {
    const dataHora = new Date().toISOString();
    const logText = `[${dataHora}] [${nivel.toUpperCase()}] ${mensagem} ${Object.keys(detalhes).length ? JSON.stringify(detalhes) : ''}\n`;
    
    if (nivel === 'error') {
        console.error(`❌ ${logText}`);
    } else {
        console.log(`ℹ️ ${logText}`);
    }

    fs.appendFile(path.join(logDir, 'sistema.log'), logText, (err) => {
        if (err) console.error('Erro ao escrever log em arquivo:', err);
    });

    try {
        await Log.create({ nivel, mensagem, detalhes });
    } catch (e) {
        // Ignora se o banco cair para evitar loop
    }
}

module.exports = logger;