const mongoose = require('mongoose');

const LogAdminSchema = new mongoose.Schema({
    autor: { type: String, required: true },
    acao: { type: String, required: true },
    detalhes: { type: String, required: true },
    data: { type: Date, default: Date.now }
});

module.exports = mongoose.model('LogAdmin', LogAdminSchema);
