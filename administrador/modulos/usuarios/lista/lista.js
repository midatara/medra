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

    const formatValue = (field, value) => {
        if (field === 'sex' || field === 'module' || field === 'category') {
            return value.charAt(0).toUpperCase() + value.slice(1);
        }
        return value;
    };

    card.innerHTML = `
        <div class="card-header">
            <img src="../../../../img/logo-principal/favicon.ico" alt="Datara-Salud" class="company-icon">
            <h2>Mi Datara - Medra</h2>
        </div>
        <div class="card-body">
            <img src="${userIconSrc}" alt="Icono" class="user-icon">
            <div class="user-info">
                <div class="field-display"><strong>Nombre Completo:</strong> <span>${user.fullName}</span> <div class="edit-icon">Edit</div></div>
                <div class="field-display"><strong>Usuario:</strong> <span>${user.username}</span> <div class="edit-icon">Edit</div></div>
                <div class="field-display"><strong>Email:</strong> <span>${user.email}</span> <div class="edit-icon">Edit</div></div>
                <div class="field-display"><strong>Fecha Nacimiento:</strong> <span>${user.birthDate}</span> <div class="edit-icon">Edit</div></div>
                <div class="field-display"><strong>Sexo:</strong> <span>${formatValue('sex', user.sex)}</span> <div class="edit-icon">Edit</div></div>
                <div class="field-display"><strong>Módulo:</strong> <span>${formatValue('module', user.module)}</span> <div class="edit-icon">Edit</div></div>
                <div class="field-display"><strong>Categoría:</strong> <span>${formatValue('category', user.category)}</span> <div class="edit-icon">Edit</div></div>
            </div>
        </div>
        <div class="buttons-container">
            <button class="edit-btn">Editar Todo</button>
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
        <div style="text-align: center; margin-bottom: 20px;">
            <img src="${userIconSrc}" alt="Usuario" style="width: 90px; height: 90px; border-radius: 50%; border: 3px solid #ddd;">
            <h3 style="margin: 12px 0 0; color: #3A5795; font-size: 18px;">${user.fullName}</h3>
        </div>
        ${createModalField('fullName', 'Nombre Completo', user.fullName, 'text')}
        ${createModalField('username', 'Usuario', user.username, 'text')}
        ${createModalField('email', 'Email', user.email, 'email')}
        ${createModalField('birthDate', 'Fecha Nacimiento', user.birthDate, 'date')}
        ${createModalField('sex', 'Sexo', user.sex, 'select', ['masculino', 'femenino', 'otro'])}
        ${createModalField('module', 'Módulo', user.module, 'select', ['Salud', 'Album', 'Personal'])}
        ${createModalField('category', 'Categoría', user.category, 'select', ['Administrador', 'Coordinadora', 'Corporativa', 'Operador', 'Laboratorio'])}
    `;
}

function createModalField(field, label, value, type, options = []) {
    const isSelect = type === 'select';
    const displayValue = isSelect ? value.charAt(0).toUpperCase() + value.slice(1) : value;
    const inputHTML = isSelect
        ? `<select class="modal-input">${options.map(opt => `<option value="${opt}" ${opt === value ? 'selected' : ''}>${opt.charAt(0).toUpperCase() + opt.slice(1)}</option>`).join('')}</select>`
        : `<input type="${type}" class="modal-input" value="${value}" autocomplete="off">`;

    return `
        <div class="modal-field-row" data-field="${field}">
            <div class="modal-field-label">${label}:</div>
            <div class="modal-field-value">${displayValue}</div>
            <div class="modal-edit-icon">Edit</div>
            <div class="modal-input-container">
                ${inputHTML}
                <div class="modal-field-actions">
                    <button class="modal-save-field">Check</button>
                    <button class="modal-cancel-field">Cross</button>
                </div>
            </div>
        </div>
    `;
}

modalUserCard.addEventListener('click', async (e) => {
    const row = e.target.closest('.modal-field-row');
    if (!row) return;

    const field = row.dataset.field;
    const valueEl = row.querySelector('.modal-field-value');
    const editIcon = row.querySelector('.modal-edit-icon');
    const inputContainer = row.querySelector('.modal-input-container');
    const input = row.querySelector('.modal-input');

    if (e.target.classList.contains('modal-edit-icon')) {
        valueEl.style.display = 'none';
        editIcon.style.display = 'none';
        inputContainer.style.display = 'flex';
        input.focus();
    }

    if (e.target.classList.contains('modal-save-field')) {
        const newValue = input.value.trim();
        if (newValue === currentEditingUser[field]) {
            exitModalEdit(row);
            return;
        }

        try {
            await updateDoc(doc(db, 'users', currentEditingUser.id), { [field]: newValue });
            currentEditingUser[field] = newValue;
            valueEl.textContent = field === 'sex' || field === 'module' || field === 'category'
                ? newValue.charAt(0).toUpperCase() + newValue.slice(1)
                : newValue;
            exitModalEdit(row);
            showMessage('Campo actualizado', 'success');
            refreshUserCard(currentEditingUser);
        } catch (error) {
            console.error('Error:', error);
            alert('Error al guardar.');
        }
    }

    if (e.target.classList.contains('modal-cancel-field')) {
        exitModalEdit(row);
    }
});

function exitModalEdit(row) {
    row.querySelector('.modal-field-value').style.display = 'block';
    row.querySelector('.modal-edit-icon').style.display = 'block';
    row.querySelector('.modal-input-container').style.display = 'none';
}

function refreshUserCard(user) {
    const oldCard = document.querySelector(`.user-card[data-user-id="${user.id}"]`);
    if (oldCard) {
        const newCard = document.createElement('div');
        renderUserCard(user);
        usersList.replaceChild(usersList.lastChild, oldCard);
    }
}

closeModal.addEventListener('click', () => modal.style.display = 'none');
window.addEventListener('click', (e) => { if (e.target === modal) modal.style.display = 'none'; });

searchInput.addEventListener('input', (e) => loadUsers(e.target.value));

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
    setTimeout(() => msg.style.display = 'none', 3000);
}

loadUsers();