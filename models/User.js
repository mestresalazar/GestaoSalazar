const mongoose = require('mongoose');

const caixaEntradaSchema = new mongoose.Schema({
    data: { type: Date, default: Date.now },
    titulo: { type: String, required: true },
    mensagem: { type: String, required: true },
    lida: { type: Boolean, default: false }
});

const UserSchema = new mongoose.Schema({
    nickname: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    cargo: { 
        type: String, 
        enum: ['Privado', 'Soldado', 'Cabo', 'Sargento', 'Tenente', 'Major', 'Coronel', 'General'], 
        default: 'Privado' 
    },
    role: { type: String, enum: ['member', 'sub_admin', 'admin'], default: 'member' },
    status: { type: String, enum: ['pendente', 'ativo', 'inativo', 'demitido'], default: 'pendente', index: true },
    dataEntrada: { type: Date, default: Date.now },
    
    emPlantao: { type: Boolean, default: false },
    estadoTurno: { type: String, enum: ['ativo', 'pausado', 'parado'], default: 'parado' },
    inicioPlantao: { type: Date, default: null },
    segundosAcumulados: { type: Number, default: 0 },
    fotoComprovanteAtiva: { type: String, default: '' },

    cooldownProvaAte: { type: Date, default: null },
    sorteioExcluidoAte: { type: Date, default: null },

    avatarUrl: { type: String, default: '/images/default-avatar.png' },
    emojiStatus: { type: String, default: '🎖️' },
    simbolo: { type: String, default: '' },
    bio: { type: String, maxLength: 120 },

    historicoTurnos: [{
        data: { type: Date, default: Date.now },
        duracao: String,
        fotoComprovante: String
    }],
    historicoPromocoes: [{
        data: { type: Date, default: Date.now },
        cargoAnterior: String,
        novoCargo: String,
        responsavel: String
    }],
    historicoSorteios: [{
        data: { type: Date, default: Date.now },
        descricaoPremio: String,
        status: { type: String, enum: ['participou', 'venceu'], default: 'participou' }
    }],
    caixaEntrada: [caixaEntradaSchema]
});

UserSchema.set('toJSON', { virtuals: true });
UserSchema.set('toObject', { virtuals: true });

module.exports = mongoose.model('User', UserSchema);