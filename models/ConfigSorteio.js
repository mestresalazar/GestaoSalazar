const mongoose = require('mongoose');

const ConfigSorteioSchema = new mongoose.Schema({
    chave: { type: String, required: true, unique: true, default: 'sorteio_ativo' },
    dataAlvo: { type: String, required: true }, // "YYYY-MM-DD"
    horarioAlvo: { type: String, required: true }, // "HH:MM"
    qtdGanhadores: { type: Number, default: 1 },
    premios: { type: String, required: true },
    executado: { type: Boolean, default: false }
});

module.exports = mongoose.model('ConfigSorteio', ConfigSorteioSchema);