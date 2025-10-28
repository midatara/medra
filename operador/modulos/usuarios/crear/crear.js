// Import the functions you need from the SDKs you need
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.13.1/firebase-app.js";
import { getAuth, createUserWithEmailAndPassword } from "https://www.gstatic.com/firebasejs/10.13.1/firebase-auth.js";
import { getFirestore, doc, setDoc } from "https://www.gstatic.com/firebasejs/10.13.1/firebase-firestore.js";

// Your web app's Firebase configuration
const firebaseConfig = {
    apiKey: "AIzaSyD6JY7FaRqjZoN6OzbFHoIXxd-IJL3H-Ek",
    authDomain: "datara-salud.firebaseapp.com",
    projectId: "datara-salud",
    storageBucket: "datara-salud.firebasestorage.app",
    messagingSenderId: "198886910481",
    appId: "1:198886910481:web:abbc345203a423a6329fb0",
    measurementId: "G-MLYVTZPPLD"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

const form = document.getElementById('form-crear-usuario');
const message = document.getElementById('message-crear');

// Event listeners para actualizar la tarjeta en tiempo real
document.getElementById('crear-fullName').addEventListener('input', updateCard);
document.getElementById('crear-username').addEventListener('input', updateCard);
document.getElementById('crear-birthDate').addEventListener('change', updateCard);
document.getElementById('crear-email').addEventListener('input', updateCard);
document.getElementById('crear-sex').addEventListener('change', updateCard);
document.getElementById('crear-module').addEventListener('change', updateCard);
document.getElementById('crear-category').addEventListener('change', updateCard);

function updateCard() {
    const fullName = document.getElementById('crear-fullName').value || 'Nombre Completo';
    const username = document.getElementById('crear-username').value || 'Usuario';
    const birthDate = document.getElementById('crear-birthDate').value || 'Fecha de Nacimiento';
    const email = document.getElementById('crear-email').value || 'Correo Electrónico';
    const sex = document.getElementById('crear-sex').value || 'otro'; // Default a 'otro'
    const module = document.getElementById('crear-module').value || 'Módulo';
    const category = document.getElementById('crear-category').value || 'Categoría';

    // Actualizar icono basado en sexo
    const iconMap = {
        'masculino': '../../../../img/icono-hombre.png',
        'femenino': '../../../../img/icono-mujer.png',
        'otro': '../../../../img/icono-otro.png'
    };
    document.getElementById('user-icon').src = iconMap[sex] || '../../../../img/icono-otro.png';

    // Actualizar textos en la tarjeta
    document.getElementById('card-fullName').textContent = fullName;
    document.getElementById('card-username').textContent = username;
    document.getElementById('card-email').textContent = email;
    document.getElementById('card-birthDate').textContent = birthDate;
    document.getElementById('card-sex').textContent = sex.charAt(0).toUpperCase() + sex.slice(1);
    document.getElementById('card-module').textContent = module;
    document.getElementById('card-category').textContent = category;
}

form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const fullName = document.getElementById('crear-fullName').value;
    const username = document.getElementById('crear-username').value;
    const birthDate = document.getElementById('crear-birthDate').value;
    const email = document.getElementById('crear-email').value;
    const sex = document.getElementById('crear-sex').value;
    const module = document.getElementById('crear-module').value;
    const category = document.getElementById('crear-category').value;
    const password = document.getElementById('crear-password').value;
    const repeatPassword = document.getElementById('crear-repeatPassword').value;

    if (password !== repeatPassword) {
        showMessage('Las contraseñas no coinciden.', 'error');
        return;
    }

    try {
        // Crear usuario en Auth
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        const user = userCredential.user;

        // Guardar datos adicionales en Firestore
        await setDoc(doc(db, 'users', user.uid), {
            fullName: fullName,
            username: username,
            birthDate: birthDate,
            email: email,
            sex: sex,
            module: module,
            category: category,
            createdAt: new Date()
        });

        showMessage('Usuario creado exitosamente.', 'success');
        form.reset();
        updateCard(); // Resetear la tarjeta también
    } catch (error) {
        console.error('Error:', error);
        showMessage('Error al crear usuario: ' + error.message, 'error');
    }
});

function showMessage(text, type) {
    message.textContent = text;
    message.className = type;
    message.style.display = 'block';
    setTimeout(() => {
        message.style.display = 'none';
    }, 5000);
}

// Inicializar tarjeta con valores por defecto
updateCard();