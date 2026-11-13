const mongoose = require('mongoose');

const UserSchema = new mongoose.Schema({
    nickname: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    cargo: { type: String, default: 'Soldado' },
    role: { type: String, default: 'membro' },
    status: { type: String, default: 'pendente' },
    emPlantao: { type: Boolean, default: false },
    estadoTurno: { type: String, default: 'parado' },
    inicioPlantao: { type: Date, default: null },
    segundosAcumulados: { type: Number, default: 0 },
    fotoComprovanteAtiva: { type: String, default: '' },
    pushSubscription: { type: Object, default: null },
    cooldownProvaAte: { type: Date, default: null },
    
    // Carteira e Missões
    carteiraSaldo: { type: Number, default: 0 },
    missoesDiarias: { type: Array, default: [] },
    historicoMissoes: [
        {
            data: { type: Date, default: Date.now },
            ciclo: { type: String },
            motivo: { type: String },
            comprovante: { type: String }
        }
    ],

    // Históricos Gerais
    historicoTurnos: [
        {
            data: { type: Date, default: Date.now },
            duracao: { type: String },
            fotoComprovante: { type: String }
        }
    ],
    historicoPromocoes: [
        {
            novoCargo: { type: String },
            cargoAnterior: { type: String },
            data: { type: Date, default: Date.now }
        }
    ],
    historicoSorteios: { type: Array, default: [] },
    caixaEntrada: [
        {
            titulo: { type: String },
            mensagem: { type: String },
            data: { type: Date, default: Date.now }
        }
    ]
}, { strict: false }); // strict: false garante que nenhum campo extra seja bloqueado

module.exports = mongoose.model('User', UserSchema);