// Importamos las librerías necesarias
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Le decimos a Express que sirva los archivos de la carpeta "public"
app.use(express.static('public'));

// Escuchamos nuevas conexiones de WebSockets (Requerimiento 2 y 3)
io.on('connection', (socket) => {
    console.log('Un usuario se ha conectado:', socket.id);

    // Unir al usuario a una sala temática (Requerimiento 4)
    socket.on('joinRoom', ({ username, room }) => {
        socket.join(room);
        // Notificamos a la sala que alguien entró (Requerimiento 7)
        socket.to(room).emit('notification', `${username} se ha unido a la sala ${room}.`);
    });

    // Escuchamos mensajes y archivos entrantes (Requerimiento 6)
    socket.on('chatMessage', (data) => {
        // Retransmitimos el mensaje a todos los usuarios en esa misma sala
        io.to(data.room).emit('message', data);
    });

    // Evento de desconexión
    socket.on('disconnect', () => {
        console.log('Usuario desconectado:', socket.id);
    });
});

// Iniciamos el servidor localmente en el puerto 3000
const PORT = 3000;
server.listen(PORT, () => {
    console.log(`Servidor corriendo localmente en: http://localhost:${PORT}`);
});