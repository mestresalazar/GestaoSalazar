const mongoose = require('mongoose');

const RecrutadoSchema = new mongoose.Schema({
  nome: { type: String, required: true },
  level: { type: String, default: 'Não informado' },
  whatsapp: { type: String, default: 'Não informado' },
  fardaEntregue: { type: Boolean, default: true },
  observacoes: { type: String, default: '' }
}, { _id: false });

const TurnoCoronelSchema = new mongoose.Schema({
  coronelId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  coronelNickname: { type: String, required: true },
  coronelCargo: { type: String, required: true },
  vaga: { type: Number, enum: [1, 2, 3], required: true }, // Vaga 1, 2 ou 3
  inicioEm: { type: Date, default: Date.now },
  fimPrevistoEm: { type: Date, required: true }, // Exatamente 3 horas
  fimRealEm: { type: Date },
  status: { type: String, enum: ['ativo', 'concluido', 'cancelado'], default: 'ativo' },
  relatorioEnviado: { type: Boolean, default: false },
  relatorio: {
    recrutamentos: [RecrutadoSchema],
    totalRecrutados: { type: Number, default: 0 },
    missoesSupervisionadas: { type: String, default: '' },
    resumoGeral: { type: String, default: '' },
    fardamentoStatus: { type: String, default: 'Entregue' },
    enviadoEm: { type: Date }
  },
  avaliacoes: [{
    usuarioId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    nickname: { type: String, required: true },
    estrelas: { type: Number, min: 1, max: 5, required: true },
    observacao: { type: String, default: '' },
    data: { type: Date, default: Date.now }
  }],
  mediaEstrelas: { type: Number, default: 0 },
  totalAvaliacoes: { type: Number, default: 0 },
  dataCriacao: { type: Date, default: Date.now }
});

TurnoCoronelSchema.index({ status: 1, vaga: 1 });
TurnoCoronelSchema.index({ coronelId: 1, status: 1 });

module.exports = mongoose.model('TurnoCoronel', TurnoCoronelSchema);
