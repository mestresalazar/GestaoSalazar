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
    status: { type: String, enum: ['pendente', 'ativo', 'inativo', 'demitido'], default: 'pendente' },
    dataEntrada: { type: Date, default: Date.now },
    
    // Status de plantão persistente (cronômetro)
    emPlantao: { type: Boolean, default: false },

    // Personalização de Perfil
    avatarUrl: { type: String, default: '/images/default-avatar.png' },
    emojiStatus: { type: String, default: '🎖️' },
    simbolo: { type: String, default: '' },
    bio: { type: String, maxLength: 120 },

    // Histórico do Membro
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

UserSchema.virtual('patamarFidelidade').get(function () {
    const agora = new Date();
    const diferencaDias = Math.floor((agora - this.dataEntrada) / (1000 * 60 * 60 * 24));

    if (diferencaDias >= 181) return { nome: 'Diamante', badge: '💎', classeCss: 'patamar-diamante' };
    if (diferencaDias >= 91)  return { nome: 'Ouro',    badge: '🥇', classeCss: 'patamar-ouro' };
    if (diferencaDias >= 31)  return { nome: 'Prata',    badge: '🥈', classeCss: 'patamar-prata' };
    return { nome: 'Bronze',   badge: '🥉', classeCss: 'patamar-bronze' };
});

UserSchema.set('toJSON', { virtuals: true });
UserSchema.set('toObject', { virtuals: true });

module.exports = mongoose.model('User', UserSchema);