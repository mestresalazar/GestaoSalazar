const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const dotenv = require('dotenv');
const cors = require('cors');
const conectarDB = require('./config/db');

// Carrega as variáveis de ambiente do .env
dotenv.config();

// Conecta ao MongoDB Atlas
conectarDB();

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// Middlewares essenciais
app.use(express.json());
app.use(cors());
app.use(express.static('public'));

// Rotas da API
app.use('/api/auth', require('./routes/authRoutes'));
app.use('/api/ponto', require('./routes/pontoRoutes'));

// Gerenciamento de Conexão em Tempo Real (Socket.io - Chat e Call)
io.on('connection', (socket) => {
  console.log(`Novo usuário conectado via Socket: ${socket.id}`);

  // Evento de entrada no chat ou sala de call
  socket.on('entrar_sala', (salaId) => {
    socket.join(salaId);
    console.log(`Usuário entrou na sala: ${salaId}`);
  });

  // Transmissão de mensagens no chat em tempo real
  socket.on('chat_mensagem', (data) => {
    io.to(data.salaId).emit('receber_mensagem', data);
  });

  // Desconexão
  socket.on('disconnect', () => {
    console.log(`Usuário desconectado: ${socket.id}`);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT} 🚀`);
});