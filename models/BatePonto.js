const mongoose = require('mongoose');

const BatePontoSchema = new mongoose.Schema({
  usuario: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  nickname: { type: String, required: true }, // Nickname para referência rápida
  data: { type: String, required: true }, // Formato 'AAAA-MM-DD' para facilitar filtros diários
  etapa: { 
    type: Number, 
    enum: [1, 2, 3], 
    required: true // Etapa 1 (17h-20h), Etapa 2 (20h-23h), Etapa 3 (23h-02h)
  },
  status: { 
    type: String, 
    enum: ['presente', 'justificado', 'faltou'], 
    default: 'presente' 
  },
  dataRegistro: { type: Date, default: Date.now }
});

// Garante que o mesmo usuário não bata o ponto duas vezes na mesma etapa do mesmo dia
BatePontoSchema.index({ usuario: 1, data: 1, etapa: 1 }, { unique: true });

module.exports = mongoose.model('BatePonto', BatePontoSchema);