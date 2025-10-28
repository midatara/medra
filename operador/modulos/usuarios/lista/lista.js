// Import the functions you need from the SDKs you need
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.13.1/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.13.1/firebase-auth.js";
import { getFirestore, collection, getDocs, query, where, doc, updateDoc } from "https://www.gstatic.com/firebasejs/10.13.1/firebase-firestore.js";

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

const usersList = document.getElementById('users-list');
const searchInput = document.getElementById('search-input');
let allUsers = []; // Almacenar todos los usuarios para filtrado local

// Función para crear input o select para el campo (definida antes de usarla)
function createInputForField(fieldName, value) {
    if (fieldName === 'sex') {
        return `
            <div class="label">Sexo:</div>
            <select class="edit-input">
                <option value="masculino" ${value === 'masculino' ? 'selected' : ''}>Masculino</option>
                <option value="femenino" ${value === 'femenino' ? 'selected' : ''}>Femenino</option>
                <option value="otro" ${value === 'otro' ? 'selected' : ''}>Otro</option>
            </select>
        `;
    } else if (fieldName === 'module') {
        return `
            <div class="label">Módulo:</div>
            <select class="edit-input">
                <option value="Salud" ${value === 'Salud' ? 'selected' : ''}>Salud</option>
                <option value="Album" ${value === 'Album' ? 'selected' : ''}>Album</option>
                <option value="Personal" ${value === 'Personal' ? 'selected' : ''}>Personal</option>
            </select>
        `;
    } else if (fieldName === 'category') {
        return `
            <div class="label">Categoría:</div>
            <select class="edit-input">
                <option value="Administrador" ${value === 'Administrador' ? 'selected' : ''}>Administrador</option>
                <option value="Coordinadora" ${value === 'Coordinadora' ? 'selected' : ''}>Coordinadora</option>
                <option value="Corporativa" ${value === 'Corporativa' ? 'selected' : ''}>Corporativa</option>
                <option value="Operador" ${value === 'Operador' ? 'selected' : ''}>Operador</option>
                <option value="Laboratorio" ${value === 'Laboratorio' ? 'selected' : ''}>Laboratorio</option>
            </select>
        `;
    } else if (fieldName === 'fullName') {
        return `
            <div class="label">Nombre Completo:</div>
            <input type="text" class="edit-input" value="${value}" autocomplete="off">
        `;
    } else if (fieldName === 'birthDate') {
        return `
            <div class="label">Fecha Nacimiento:</div>
            <input type="date" class="edit-input" value="${value}" autocomplete="off">
        `;
    } else if (fieldName === 'email') {
        return `
            <div class="label">Email:</div>
            <input type="email" class="edit-input" value="${value}" autocomplete="off">
        `;
    } else if (fieldName === 'username') {
        return `
            <div class="label">Usuario:</div>
            <input type="text" class="edit-input" value="${value}" autocomplete="off">
        `;
    }
    return `
        <div class="label">${fieldName}:</div>
        <input type="text" class="edit-input" value="${value}" autocomplete="off">
    `;
}

// Verificar autenticación
onAuthStateChanged(auth, async (user) => {
    if (!user) {
        window.location.replace('../../../../index.html');
        return;
    }
    await loadUsers();
});

// Cargar usuarios desde Firestore
async function loadUsers(searchTerm = '') {
    try {
        const q = query(collection(db, 'users'));
        const querySnapshot = await getDocs(q);
        allUsers = [];
        usersList.innerHTML = '';

        querySnapshot.forEach((doc) => {
            const userData = doc.data();
            const user = {
                id: doc.id,
                ...userData
            };
            allUsers.push(user);

            if (searchTerm === '' || 
                user.fullName.toLowerCase().includes(searchTerm.toLowerCase()) || 
                user.username.toLowerCase().includes(searchTerm.toLowerCase())) {
                renderUserCard(user);
            }
        });

        if (allUsers.length === 0 && searchTerm === '') {
            usersList.innerHTML = '<p style="text-align: center; color: #666; grid-column: 1 / -1;">No hay usuarios registrados.</p>';
        }
    } catch (error) {
        console.error('Error al cargar usuarios:', error);
        usersList.innerHTML = '<p style="text-align: center; color: #721c24;">Error al cargar usuarios.</p>';
    }
}

// Renderizar tarjeta de usuario con funcionalidad de edición
function renderUserCard(user) {
    const card = document.createElement('div');
    card.className = 'user-card';
    card.dataset.userId = user.id; // Para identificar al usuario

    // Icono basado en sexo
    const iconMap = {
        'masculino': '../../../../img/icono-hombre.png',
        'femenino': '../../../../img/icono-mujer.png',
        'otro': '../../../../img/icono-otro.png'
    };
    const userIconSrc = iconMap[user.sex] || '../../../../img/icono-otro.png';

    card.innerHTML = `
        <div class="card-header">
            <img src="../../../../img/letra-d.png" alt="Datara-Salud" class="company-icon">
            <h2>Datara-Salud</h2>
        </div>
        <div class="card-body">
            <img src="${userIconSrc}" alt="Icono de usuario" class="user-icon">
            <div class="user-info">
                <div class="editable-field" data-field="fullName">
                    <span class="display-text"><h3>${user.fullName}</h3></span>
                    <span class="edit-input" style="display: none;">${createInputForField('fullName', user.fullName)}</span>
                </div>
                <div class="editable-field" data-field="username">
                    <span class="display-text"><p><strong>Usuario:</strong> ${user.username}</p></span>
                    <span class="edit-input" style="display: none;">${createInputForField('username', user.username)}</span>
                </div>
                <div class="editable-field" data-field="email">
                    <span class="display-text"><p><strong>Email:</strong> ${user.email}</p></span>
                    <span class="edit-input" style="display: none;">${createInputForField('email', user.email)}</span>
                </div>
                <div class="editable-field" data-field="birthDate">
                    <span class="display-text"><p><strong>Fecha Nacimiento:</strong> ${user.birthDate}</p></span>
                    <span class="edit-input" style="display: none;">${createInputForField('birthDate', user.birthDate)}</span>
                </div>
                <div class="editable-field" data-field="sex">
                    <span class="display-text"><p><strong>Sexo:</strong> ${user.sex.charAt(0).toUpperCase() + user.sex.slice(1)}</p></span>
                    <span class="edit-input" style="display: none;">${createInputForField('sex', user.sex)}</span>
                </div>
                <div class="editable-field" data-field="module">
                    <span class="display-text"><p><strong>Módulo:</strong> ${user.module}</p></span>
                    <span class="edit-input" style="display: none;">${createInputForField('module', user.module)}</span>
                </div>
                <div class="editable-field" data-field="category">
                    <span class="display-text"><p><strong>Categoría:</strong> ${user.category}</p></span>
                    <span class="edit-input" style="display: none;">${createInputForField('category', user.category)}</span>
                </div>
            </div>
        </div>
        <div class="buttons-container">
            <button class="edit-btn">Editar</button>
            <div class="save-cancel-buttons">
                <button class="save-btn">Guardar</button>
                <button class="cancel-btn">Cancelar</button>
            </div>
        </div>
    `;

    // Event listener para el botón editar
    const editBtn = card.querySelector('.edit-btn');
    const saveBtn = card.querySelector('.save-btn');
    const cancelBtn = card.querySelector('.cancel-btn');

    editBtn.addEventListener('click', () => enterEditMode(card, user));

    saveBtn.addEventListener('click', () => saveEdits(card));

    cancelBtn.addEventListener('click', () => cancelEdit(card, user));

    usersList.appendChild(card);
}

// Entrar en modo edición
function enterEditMode(card, user) {
    card.classList.add('editing');
    const editableFields = card.querySelectorAll('.editable-field');
    const editBtn = card.querySelector('.edit-btn');
    const saveCancel = card.querySelector('.save-cancel-buttons');

    editBtn.style.display = 'none';
    saveCancel.style.display = 'flex';

    editableFields.forEach(field => {
        const displayText = field.querySelector('.display-text');
        const editInput = field.querySelector('.edit-input');
        displayText.style.display = 'none';
        editInput.style.display = 'block';
    });
}

// Guardar ediciones
async function saveEdits(card) {
    const updates = {};
    const editableFields = card.querySelectorAll('.editable-field .edit-input');

    editableFields.forEach(input => {
        const fieldName = input.closest('.editable-field').dataset.field;
        updates[fieldName] = input.value;
    });

    try {
        await updateDoc(doc(db, 'users', card.dataset.userId), updates);
        card.classList.remove('editing');
        const editBtn = card.querySelector('.edit-btn');
        const saveCancel = card.querySelector('.save-cancel-buttons');
        editBtn.style.display = 'block';
        saveCancel.style.display = 'none';
        loadUsers(searchInput.value); // Recargar para actualizar
    } catch (error) {
        console.error('Error al actualizar usuario:', error);
        alert('Error al actualizar usuario.');
    }
}

// Cancelar edición
function cancelEdit(card, user) {
    card.classList.remove('editing');
    const editableFields = card.querySelectorAll('.editable-field');
    const editBtn = card.querySelector('.edit-btn');
    const saveCancel = card.querySelector('.save-cancel-buttons');

    editBtn.style.display = 'block';
    saveCancel.style.display = 'none';

    editableFields.forEach(field => {
        const fieldName = field.dataset.field;
        const originalValue = user[fieldName];
        const displayText = field.querySelector('.display-text');
        const editInput = field.querySelector('.edit-input');
        displayText.innerHTML = fieldName === 'fullName' 
            ? `<h3>${originalValue}</h3>` 
            : `<p><strong>${getLabel(fieldName)}:</strong> ${originalValue}</p>`;
        displayText.style.display = 'block';
        editInput.style.display = 'none';
    });
}

// Función auxiliar para obtener labels
function getLabel(fieldName) {
    const labels = {
        'username': 'Usuario',
        'email': 'Email',
        'birthDate': 'Fecha Nacimiento',
        'sex': 'Sexo',
        'module': 'Módulo',
        'category': 'Categoría'
    };
    return labels[fieldName] || fieldName;
}

// Event listener para búsqueda en tiempo real
searchInput.addEventListener('input', (e) => {
    const searchTerm = e.target.value;
    loadUsers(searchTerm);
});

// Cargar usuarios iniciales
loadUsers();