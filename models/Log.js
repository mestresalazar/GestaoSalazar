const mongoose = require('mongoose');

const LogSchema = new mongoose.Schema({
  nivel: { type: String, enum: ['info', 'warning', 'error', 'auth'], default: 'info' },
  mensagem: { type: String, required: true },
  detalhes: { type: Object },
  ip: { type: String },
  dataCriacao: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Log', LogSchema);