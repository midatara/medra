import { initializeApp } from "https://www.gstatic.com/firebasejs/10.13.1/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.13.1/firebase-auth.js";
import { getFirestore, collection, getDocs, doc, updateDoc } from "https://www.gstatic.com/firebasejs/10.13.1/firebase-firestore.js";

const firebaseConfig = {
    apiKey: "AIzaSyD6JY7FaRqjZoN6OzbFHoIXxd-IJL3H-Ek",
    authDomain: "datara-salud.firebaseapp.com",
    projectId: "datara-salud",
    storageBucket: "datara-salud.firebasestorage.app",
    messagingSenderId: "198886910481",
    appId: "1:198886910481:web:abbc345203a423a6329fb0",
    measurementId: "G-MLYVTZPPLD"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

const usersList = document.getElementById('users-list');
const searchInput = document.getElementById('search-input');
const modal = document.getElementById('edit-modal');
const modalUserCard = document.getElementById('modal-user-card');
const closeModal = document.querySelector('.close-modal');

let allUsers = [];
let currentEditingUser = null;

onAuthStateChanged(auth, async (user) => {
    if (!user) {
        window.location.replace('../../../../index.html');
        return;
    }
    await loadUsers();
});

async function loadUsers(searchTerm = '') {
    try {
        const q = collection(db, 'users');
        const querySnapshot = await getDocs(q);
        allUsers = [];
        usersList.innerHTML = '';

        querySnapshot.forEach((doc) => {
            const userData = doc.data();
            const user = { id: doc.id, ...userData };
            allUsers.push(user);

            if (!searchTerm || 
                user.fullName.toLowerCase().includes(searchTerm.toLowerCase()) || 
                user.username.toLowerCase().includes(searchTerm.toLowerCase())) {
                renderUserCard(user);
            }
        });

        if (allUsers.length === 0 && !searchTerm) {
            usersList.innerHTML = '<p style="text-align: center; color: #666; grid-column: 1 / -1;">No hay usuarios registrados.</p>';
        }
    } catch (error) {
        console.error('Error:', error);
        usersList.innerHTML = '<p style="text-align: center; color: #721c24;">Error al cargar usuarios.</p>';
    }
}

function renderUserCard(user) {
    const card = document.createElement('div');
    card.className = 'user-card';
    card.dataset.userId = user.id;

    const iconMap = {
        'masculino': '../../../../img/user-h/favicon.ico',
        'femenino': '../../../../img/user-m/favicon.ico',
        'otro': '../../../../img/user-n/favicon.ico'
    };
    const userIconSrc = iconMap[user.sex] || '../../../../img/user-n/favicon.ico';

    card.innerHTML = `
        <div class="card-header">
            <img src="../../../../img/logo-principal/favicon.ico" alt="Datara-Salud" class="company-icon">
            <h2>Mi Datara - Medra</h2>
        </div>
        <div class="card-body">
            <img src="${userIconSrc}" alt="Icono" class="user-icon">
            <div class="user-info">
                <h3>${user.fullName}</h3>
                <p><strong>Usuario:</strong> ${user.username}</p>
                <p><strong>Email:</strong> ${user.email}</p>
            </div>
        </div>
        <div class="buttons-container">
            <button class="edit-btn">Editar</button>
        </div>
    `;

    card.querySelector('.edit-btn').addEventListener('click', () => openEditModal(user));
    usersList.appendChild(card);
}

function openEditModal(user) {
    currentEditingUser = user;
    modal.style.display = 'flex';

    const iconMap = {
        'masculino': '../../../../img/user-h/favicon.ico',
        'femenino': '../../../../img/user-m/favicon.ico',
        'otro': '../../../../img/user-n/favicon.ico'
    };
    const userIconSrc = iconMap[user.sex] || '../../../../img/user-n/favicon.ico';

    modalUserCard.innerHTML = `
        <div style="text-align: center; margin-bottom: 16px;">
            <img src="${userIconSrc}" alt="Usuario" style="width: 80px; height: 80px; border-radius: 50%; border: 3px solid #ddd;">
            <h3 style="margin: 10px 0 0; color: #3A5795;">${user.fullName}</h3>
        </div>

        ${createFieldRow('fullName', 'Nombre Completo', user.fullName, 'text')}
        ${createFieldRow('username', 'Usuario', user.username, 'text')}
        ${createFieldRow('email', 'Email', user.email, 'email')}
        ${createFieldRow('birthDate', 'Fecha Nacimiento', user.birthDate, 'date')}
        ${createFieldRow('sex', 'Sexo', user.sex.charAt(0).toUpperCase() + user.sex.slice(1), 'select', ['masculino', 'femenino', 'otro'])}
        ${createFieldRow('module', 'Módulo', user.module, 'select', ['Salud', 'Album', 'Personal'])}
        ${createFieldRow('category', 'Categoría', user.category, 'select', ['Administrador', 'Coordinadora', 'Corporativa', 'Operador', 'Laboratorio'])}
    `;
}

function createFieldRow(field, label, value, type = 'text', options = []) {
    const isSelect = type === 'select';
    const inputHTML = isSelect
        ? `<select class="field-input">${options.map(opt => `<option value="${opt}" ${opt === value ? 'selected' : ''}>${opt.charAt(0).toUpperCase() + opt.slice(1)}</option>`).join('')}</select>`
        : `<input type="${type}" class="field-input" value="${value}" autocomplete="off">`;

    return `
        <div class="field-row" data-field="${field}">
            <div class="field-label">${label}:</div>
            <div class="field-value">${isSelect ? value.charAt(0).toUpperCase() + value.slice(1) : value}</div>
            <div class="edit-icon">Edit</div>

            <div class="field-input-container">
                ${inputHTML}
                <div class="field-actions">
                    <button class="save-field" title="Guardar">Check</button>
                    <button class="cancel-field" title="Cancelar">Cross</button>
                </div>
            </div>
        </div>
    `;
}

modalUserCard.addEventListener('click', async (e) => {
    const row = e.target.closest('.field-row');
    if (!row) return;

    const field = row.dataset.field;
    const valueEl = row.querySelector('.field-value');
    const editIcon = row.querySelector('.edit-icon');
    const inputContainer = row.querySelector('.field-input-container');
    const saveBtn = row.querySelector('.save-field');
    const cancelBtn = row.querySelector('.cancel-field');
    const input = row.querySelector('.field-input');

    if (e.target.classList.contains('edit-icon')) {
        valueEl.style.display = 'none';
        editIcon.style.display = 'none';
        inputContainer.style.display = 'flex';
        input.focus();
        if (input.tagName === 'SELECT') input.focus();
    }

    if (e.target.classList.contains('save-field')) {
        const newValue = input.value.trim();
        if (newValue === currentEditingUser[field]) {
            exitEditMode(row);
            return;
        }

        try {
            await updateDoc(doc(db, 'users', currentEditingUser.id), { [field]: newValue });
            currentEditingUser[field] = newValue;
            valueEl.textContent = field === 'sex' || field === 'module' || field === 'category'
                ? newValue.charAt(0).toUpperCase() + newValue.slice(1)
                : newValue;
            exitEditMode(row);
            showMessage('Campo actualizado', 'success');
            refreshUserCard(currentEditingUser);
        } catch (error) {
            console.error('Error:', error);
            alert('Error al guardar.');
        }
    }

    if (e.target.classList.contains('cancel-field')) {
        exitEditMode(row);
    }
});

function exitEditMode(row) {
    row.querySelector('.field-value').style.display = 'block';
    row.querySelector('.edit-icon').style.display = 'block';
    row.querySelector('.field-input-container').style.display = 'none';
}

function refreshUserCard(user) {
    const card = document.querySelector(`.user-card[data-user-id="${user.id}"]`);
    if (card) {
        usersList.removeChild(card);
        renderUserCard(user);
    }
}

closeModal.addEventListener('click', () => {
    modal.style.display = 'none';
});

window.addEventListener('click', (e) => {
    if (e.target === modal) {
        modal.style.display = 'none';
    }
});

searchInput.addEventListener('input', (e) => {
    loadUsers(e.target.value);
});

function showMessage(text, type) {
    let msg = document.getElementById('message-lista');
    if (!msg) {
        msg = document.createElement('div');
        msg.id = 'message-lista';
        document.body.appendChild(msg);
    }
    msg.textContent = text;
    msg.className = type;
    msg.style.display = 'block';
    setTimeout(() => { msg.style.display = 'none'; }, 3000);
}

loadUsers();