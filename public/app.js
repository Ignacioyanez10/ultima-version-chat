// Importamos Firebase desde sus servidores oficiales
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { getFirestore, collection, addDoc, query, where, orderBy, limit, getDocs, startAfter, serverTimestamp, doc, deleteDoc, onSnapshot } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, onAuthStateChanged, updateProfile, signOut, signInWithPopup, GoogleAuthProvider } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";

// === CONFIGURACIÓN DE FIREBASE === 
const firebaseConfig = {
  apiKey: "AIzaSyACCTFwvv_YW_FGtM79RTyxvkYaSoTNaQ8",
  authDomain: "michatrailway.firebaseapp.com",
  projectId: "michatrailway",
  storageBucket: "michatrailway.firebasestorage.app",
  messagingSenderId: "196948202044",
  appId: "1:196948202044:web:cb34c2a8ce46993ed76939"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

// === VARIABLES GLOBALES ===
const socket = io();
let username = "";
let currentRoom = "General";
let unsubscribeRooms = null;
let localMessages = [];
let lastVisibleDoc = null;
const soundSend = new Audio('/sounds/notificacion.mp3');
const soundReceive = new Audio('/sounds/notificacion.mp3');
const audioNotificacion = new Audio('/sounds/notificacion.mp3');

// ============================================================
// === SISTEMA DE AUTENTICACIÓN FIREBASE (EMAIL + CONTRASEÑA) ===
// ============================================================

// Cambia entre la pestaña de Login y la de Registro
window.switchTab = (tab) => {
    document.getElementById('form-login').style.display = tab === 'login' ? 'flex' : 'none';
    document.getElementById('form-register').style.display = tab === 'register' ? 'flex' : 'none';
    document.getElementById('tab-login').classList.toggle('active', tab === 'login');
    document.getElementById('tab-register').classList.toggle('active', tab === 'register');
    document.getElementById('auth-error').textContent = '';
};

// Iniciar sesión con email y contraseña
window.loginUser = async () => {
    const email = document.getElementById('login-email').value.trim();
    const password = document.getElementById('login-password').value;
    const errorEl = document.getElementById('auth-error');
    const btn = document.getElementById('btn-login');

    errorEl.textContent = '';
    btn.textContent = 'Ingresando...';
    btn.disabled = true;

    try {
        await signInWithEmailAndPassword(auth, email, password);
        // onAuthStateChanged se encarga del resto
    } catch (error) {
        errorEl.textContent = getAuthErrorMessage(error.code);
        btn.textContent = 'Iniciar Sesión';
        btn.disabled = false;
    }
};

// Crear nueva cuenta
window.registerUser = async () => {
    const displayName = document.getElementById('reg-username').value.trim();
    const email = document.getElementById('reg-email').value.trim();
    const password = document.getElementById('reg-password').value;
    const errorEl = document.getElementById('auth-error');
    const btn = document.getElementById('btn-register');

    errorEl.textContent = '';

    if (!displayName) {
        errorEl.textContent = 'Por favor ingresa un nombre de usuario.';
        return;
    }

    btn.textContent = 'Creando cuenta...';
    btn.disabled = true;

    try {
        const credential = await createUserWithEmailAndPassword(auth, email, password);
        await updateProfile(credential.user, { displayName });
        // onAuthStateChanged se encarga del resto
    } catch (error) {
        errorEl.textContent = getAuthErrorMessage(error.code);
        btn.textContent = 'Crear Cuenta';
        btn.disabled = false;
    }
};

// Cerrar sesión
window.logoutUser = async () => {
    await signOut(auth);
};

// Traduce los códigos de error de Firebase a mensajes amigables en español
function getAuthErrorMessage(code) {
    const messages = {
        'auth/invalid-email': 'El correo electrónico no es válido.',
        'auth/user-not-found': 'No existe una cuenta con ese correo.',
        'auth/wrong-password': 'Contraseña incorrecta.',
        'auth/email-already-in-use': 'Ya existe una cuenta con ese correo.',
        'auth/weak-password': 'La contraseña debe tener al menos 6 caracteres.',
        'auth/too-many-requests': 'Demasiados intentos fallidos. Espera unos minutos.',
        'auth/invalid-credential': 'Correo o contraseña incorrectos.',
        'auth/network-request-failed': 'Error de conexión. Verifica tu internet.',
    };
    return messages[code] || `Error inesperado (${code}). Inténtalo de nuevo.`;
}

// Observa los cambios de sesión: si el usuario inicia sesión, entra al chat.
// Si cierra sesión, vuelve a la pantalla de login.
onAuthStateChanged(auth, (user) => {
    if (user) {
        // Usuario autenticado: usamos su displayName o la parte antes del @ del email
        username = user.displayName || user.email.split('@')[0];

        // Mostramos su nombre e email en el sidebar
        document.getElementById('user-display-name').textContent = username;
        document.getElementById('user-display-email').textContent = user.email;

        // Ocultamos login y mostramos el chat
        document.getElementById('login-screen').style.display = 'none';

        listenToRooms(); // <--- INICIA LA CARGA DE SALAS

        switchRoom('General');
    } else {
        // Usuario desconectado: mostramos la pantalla de login
        username = '';
        if (unsubscribeRooms) unsubscribeRooms(); // <--- APAGA LA CARGA DE SALAS AL SALIR

        document.getElementById('login-screen').style.display = 'flex';
        // Reseteamos botones por si quedaron deshabilitados
        const btnLogin = document.getElementById('btn-login');
        const btnReg = document.getElementById('btn-register');
        if (btnLogin) { btnLogin.textContent = 'Iniciar Sesión'; btnLogin.disabled = false; }
        if (btnReg) { btnReg.textContent = 'Crear Cuenta'; btnReg.disabled = false; }
    }
});


// ============================================================
// === LÓGICA DEL CHAT ===
// ============================================================

// ============================================================
// === GESTIÓN DE SALAS DINÁMICAS ===
// ============================================================

// Crear una nueva sala
window.createRoom = async () => {
    const input = document.getElementById('new-room-input');
    const roomName = input.value.trim();

    if (!roomName) return;
    
    // Evitamos duplicar la sala General
    if (roomName.toLowerCase() === 'general') {
        Toastify({ text: "La sala General ya es fija.", duration: 3000, style: { background: "#f44336" } }).showToast();
        return;
    }

    try {
        await addDoc(collection(db, "rooms"), {
            name: roomName,
            createdBy: username,
            createdAt: serverTimestamp()
        });
        input.value = '';
        Toastify({ text: `Sala "${roomName}" creada`, duration: 3000, style: { background: "#4caf50" } }).showToast();
    } catch (error) {
        console.error("Error al crear sala:", error);
    }
};

// Escuchar las salas en tiempo real
function listenToRooms() {
    const roomsRef = collection(db, "rooms");
    const q = query(roomsRef, orderBy("createdAt", "asc"));
    
    unsubscribeRooms = onSnapshot(q, (snapshot) => {
        const roomsList = document.getElementById('dynamic-rooms-list');
        if (!roomsList) return;
        
        roomsList.innerHTML = ''; // Limpiar la lista para evitar duplicados
        
        snapshot.forEach((docSnap) => {
            const roomData = docSnap.data();
            const roomId = docSnap.id;
            const roomName = roomData.name;
            const creator = roomData.createdBy;

            // Contenedor principal de la sala
            const roomDiv = document.createElement('div');
            roomDiv.style.display = 'flex';
            roomDiv.style.alignItems = 'center';
            roomDiv.style.gap = '5px';
            roomDiv.style.padding = '0 10px';
            roomDiv.style.marginBottom = '5px';

            // Botón para ingresar a la sala
            const roomBtn = document.createElement('button');
            roomBtn.className = 'room-btn';
            roomBtn.innerText = `💬 ${roomName}`;
            roomBtn.style.flex = '1';
            roomBtn.style.margin = '0';
            roomBtn.onclick = () => switchRoom(roomName);

            roomDiv.appendChild(roomBtn);

            // Botón para eliminar (SOLO si el usuario logueado es el creador)
            if (creator === username) {
                const deleteBtn = document.createElement('button');
                deleteBtn.innerText = '🗑️';
                deleteBtn.title = 'Eliminar sala';
                deleteBtn.style.cursor = 'pointer';
                deleteBtn.style.background = '#ff4d4d';
                deleteBtn.style.color = 'white';
                deleteBtn.style.border = 'none';
                deleteBtn.style.borderRadius = '4px';
                deleteBtn.style.padding = '8px 10px';
                deleteBtn.onclick = () => deleteRoom(roomId, roomName);
                roomDiv.appendChild(deleteBtn);
            }

            roomsList.appendChild(roomDiv);
        });
    });
}

// Eliminar sala
window.deleteRoom = async (roomId, roomName) => {
    if (!confirm(`¿Estás seguro de que deseas eliminar la sala "${roomName}"?`)) return;

    try {
        await deleteDoc(doc(db, "rooms", roomId));
        Toastify({ text: `Sala "${roomName}" eliminada`, duration: 3000, style: { background: "#f44336" } }).showToast();
        
        // Si estábamos en la sala eliminada, forzamos volver a "General"
        if (currentRoom === roomName) {
            switchRoom('General');
        }
    } catch (error) {
        console.error("Error al eliminar sala:", error);
    }
};





// === CAMBIAR DE SALA ===
window.switchRoom = async (roomName) => {
    currentRoom = roomName;
    document.getElementById('current-room-title').innerText = `Sala: ${currentRoom}`;


    // 1. Recreamos el HTML, pero ahora el "loading-more" nace OCULTO (display: none)
    document.getElementById('messages-container').innerHTML = `
        <div id="loading-more" style="display: none; text-align: center; padding: 10px; color: #888; font-size: 14px;">⏳ Cargando mensajes anteriores...</div>
        <div id="scroll-anchor" style="height: 1px;"></div>
    `;

    // 2. RECONECTAMOS el sensor de scroll al nuevo "scroll-anchor"
    const newAnchor = document.getElementById('scroll-anchor');
    if (newAnchor) {
        observer.disconnect(); 
        observer.observe(newAnchor); 
    }

    socket.emit('joinRoom', { username, room: currentRoom });
    localMessages = [];
    lastVisibleDoc = null;

    await loadMessagesFromFirebase();

    // === NUEVO: Bajar el scroll automáticamente al entrar a la sala ===
    setTimeout(() => {
        const container = document.getElementById('messages-container');
        if (container) {
            container.scrollTop = container.scrollHeight;
        }
},100);
};

// === ENVIAR MENSAJES TEXTO ===
window.sendMessage = async () => {
    const input = document.getElementById('message-input');
    const text = input.value.trim();
    if (text === "") return;

    const messageData = {
        username: username,
        room: currentRoom,
        text: text,
        type: 'text',
        timestamp: serverTimestamp()
    };

    input.value = '';

    try {
        await addDoc(collection(db, "messages"), messageData);
        socket.emit('chatMessage', messageData);
        soundSend.play().catch(err => console.log("Sonido bloqueado por el navegador:", err));
    } catch (error) {
        console.error("Error al enviar mensaje:", error);
    }
};

// Insertar Emoji rápido
window.insertEmoji = (emoji) => {
    const input = document.getElementById('message-input');
    input.value += emoji;
    input.focus();
};

// === ENVIAR ARCHIVOS ===
window.sendFile = async () => {
    const fileInput = document.getElementById('file-input');
    const file = fileInput.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function(event) {
        const img = new Image();
        img.onload = function() {
            const canvas = document.createElement('canvas');
            const MAX_WIDTH = 500;
            const scaleSize = MAX_WIDTH / img.width;
            canvas.width = MAX_WIDTH;
            canvas.height = img.height * scaleSize;

            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

            const dataUrl = canvas.toDataURL('image/jpeg', 0.6);

            const messageData = {
                username: username,
                room: currentRoom,
                text: 'Ha enviado una imagen',
                type: 'image',
                fileUrl: dataUrl,
                timestamp: serverTimestamp()
            };

            addDoc(collection(db, "messages"), messageData)
                .then(() => {
                    socket.emit('chatMessage', messageData);
                    soundSend.play().catch(err => console.log("Sonido bloqueado:", err));
                })
                .catch(err => console.error("Error al guardar foto:", err));
        };
        img.src = event.target.result;
    };
    reader.readAsDataURL(file);
};

// === RECIBIR MENSAJES Y NOTIFICACIONES ===
socket.on('message', (data) => {
    renderMessage(data, true);
    localMessages.push(data);
    
    if (data && data.username && username) {
        
        const remitente = data.username.trim().toLowerCase();
        const yoMismo = username.trim().toLowerCase();
        if (remitente !== yoMismo) {
            audioNotificacion.play().catch(() => console.log("Sonido bloqueado por el navegador"));
        }
    }
});

socket.on('notification', (text) => {
    Toastify({
        text: text,
        duration: 3000,
        gravity: "top",
        position: "right",
        style: { background: "#128c7e" }
    }).showToast();

    audioNotificacion.play().catch(() => console.log("Sonido bloqueado por el navegador"));

});

// Renderiza un mensaje en la pantalla HTML
function renderMessage(data, appendAtBottom = true) {
    const container = document.getElementById('messages-container');
    const msgDiv = document.createElement('div');
    msgDiv.classList.add('message');
    if (data.username === username) msgDiv.classList.add('mine');

    let content = "";

    if (data.type === 'image') {
        content = `<strong>${data.username}</strong>
                   <img src="${data.fileUrl}" style="max-width: 200px; border-radius: 8px; margin-top: 5px;">`;
    } else {
        content = `<strong>${data.username}</strong> ${data.text}`;
    }
    
    msgDiv.innerHTML = content;

    if (appendAtBottom) {
        container.appendChild(msgDiv);
        
        // Si el mensaje tiene una imagen, esperamos a que cargue para calcular el scroll
        const img = msgDiv.querySelector('img');
        if (img) {
            img.onload = () => { container.scrollTop = container.scrollHeight; };
        }
        
        // Un pequeño retraso asegura que el navegador haya renderizado el texto antes de bajar
        setTimeout(() => {
            container.scrollTop = container.scrollHeight;
        }, 50);
        
    } else {
        // Esto es para cuando scrolleas hacia arriba para cargar mensajes antiguos
        const anchor = document.getElementById('scroll-anchor');
        container.insertBefore(msgDiv, anchor.nextSibling);
    }
}

// === HISTORIAL CON SCROLL INFINITO ===
async function loadMessagesFromFirebase() {
    try {
        const messagesRef = collection(db, "messages");
        let q;

        if (lastVisibleDoc) {
            q = query(messagesRef, where("room", "==", currentRoom), orderBy("timestamp", "desc"), startAfter(lastVisibleDoc), limit(15));
        } else {
            q = query(messagesRef, where("room", "==", currentRoom), orderBy("timestamp", "desc"), limit(15));
        }

        const querySnapshot = await getDocs(q);

        if (!querySnapshot.empty) {
            lastVisibleDoc = querySnapshot.docs[querySnapshot.docs.length - 1];
            const docs = querySnapshot.docs;
            
            for (let i = 0; i < docs.length; i++) {
                const data = docs[i].data();
                renderMessage(data, false);
                localMessages.unshift(data);
            }
        }
    } catch (error) {
        console.error("❌ ERROR CRÍTICO AL LEER DE FIREBASE:", error);
        alert("Firestore no pudo leer los mensajes. Abre la consola (F12) para ver el error.");
    }
}

// Intersection Observer: detecta cuando llegamos arriba del todo
const observer = new IntersectionObserver((entries) => {
    if (entries[0].isIntersecting && username !== "") {
        document.getElementById('loading-more').style.display = 'block';
        loadMessagesFromFirebase().then(() => {
            document.getElementById('loading-more').style.display = 'none';
        });
    }
});

window.onload = () => {
    observer.observe(document.getElementById('scroll-anchor'));
};

// === BUSCADOR EN EL HISTORIAL CLIENTE ===
window.searchMessages = () => {
    const searchTerm = document.getElementById('search-input').value.toLowerCase().trim();
    const container = document.getElementById('messages-container');
    
    container.querySelectorAll('.message').forEach(msg => msg.remove());

    if (searchTerm === "") {
        localMessages.forEach(data => renderMessage(data, true));
        return;
    }

    const filtered = localMessages.filter(msg => 
        (msg.text && msg.text.toLowerCase().includes(searchTerm)) || 
        (msg.username && msg.username.toLowerCase().includes(searchTerm))
    );
    
    filtered.forEach(data => renderMessage(data, true));
};


// ============================================================
// === INICIO DE SESIÓN CON GOOGLE ===
// ============================================================

const googleProvider = new GoogleAuthProvider();
const btnGoogle = document.getElementById('btn-google');

if (btnGoogle) {
    btnGoogle.addEventListener('click', async () => {
        try {
            // Utilizamos el 'auth' que ya inicializaste en la línea 16
            const result = await signInWithPopup(auth, googleProvider);
            const user = result.user;
            console.log("Sesión iniciada con Google:", user.email);
            
            // ¡Listo! Tu función onAuthStateChanged (línea 86) detectará 
            // este inicio de sesión y hará el cambio de pantalla automáticamente.
            
        } catch (error) {
            console.error("Error al iniciar con Google:", error);
            const errorDiv = document.getElementById('auth-error');
            errorDiv.textContent = "Error al conectar con Google.";
            errorDiv.style.display = "block";
        }
    });
}