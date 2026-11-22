const mongoose = require('mongoose');

const JustificativaSchema = new mongoose.Schema({
  usuario: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  nickname: { type: String, required: true },
  cargo: { type: String, default: 'Privado' },
  motivo: { type: String, required: true },
  mensagem: { type: String, required: true },
  status: {
    type: String,
    enum: ['pendente', 'aprovada', 'arquivada'],
    default: 'pendente'
  },
  respostaComando: { type: String, default: '' },
  analisadoPor: { type: String, default: '' },
  dataCriacao: { type: Date, default: Date.now },
  dataAnalise: { type: Date }
});

module.exports = mongoose.model('Justificativa', JustificativaSchema);
