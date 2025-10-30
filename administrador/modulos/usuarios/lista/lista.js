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
let currentUser = null;

onAuthStateChanged(auth, async (user) => {
    if (!user) {
        window.location.replace('../../../../index.html');
        return;
    }
    await loadUsers();
});

async function loadUsers(term = '') {
    try {
        const q = collection(db, 'users');
        const snapshot = await getDocs(q);
        allUsers = [];
        usersList.innerHTML = '';

        snapshot.forEach(doc => {
            const data = doc.data();
            const user = { id: doc.id, ...data };
            allUsers.push(user);

            if (!term || 
                user.fullName.toLowerCase().includes(term.toLowerCase()) || 
                user.username.toLowerCase().includes(term.toLowerCase())) {
                renderUserCard(user);
            }
        });

        if (allUsers.length === 0 && !term) {
            usersList.innerHTML = '<p style="text-align:center;color:#666;grid-column:1/-1;">No hay usuarios registrados.</p>';
        }
    } catch (error) {
        console.error(error);
        usersList.innerHTML = '<p style="text-align:center;color:#721c24;">Error al cargar usuarios.</p>';
    }
}

function renderUserCard(user) {
    const card = document.createElement('div');
    card.className = 'user-card';
    card.dataset.id = user.id;

    const iconMap = {
        masculino: '../../../../img/user-h/favicon.ico',
        femenino: '../../../../img/user-m/favicon.ico',
        otro: '../../../../img/user-n/favicon.ico'
    };
    const icon = iconMap[user.sex] || '../../../../img/user-n/favicon.ico';

    card.innerHTML = `
        <div class="card-header">
            <img src="../../../../img/logo-principal/favicon.ico" alt="Logo" class="company-icon">
            <h2>Mi Datara - Medra</h2>
        </div>
        <div class="card-body">
            <img src="${icon}" alt="Usuario" class="user-icon">
            <div class="user-info">
                <p><strong>Nombre:</strong> ${user.fullName}</p>
                <p><strong>Usuario:</strong> ${user.username}</p>
                <p><strong>Email:</strong> ${user.email}</p>
                <p><strong>Nacimiento:</strong> ${user.birthDate}</p>
                <p><strong>Sexo:</strong> ${user.sex.charAt(0).toUpperCase() + user.sex.slice(1)}</p>
                <p><strong>Módulo:</strong> ${user.module}</p>
                <p><strong>Categoría:</strong> ${user.category}</p>
            </div>
        </div>
        <div class="buttons-container">
            <button class="edit-btn">Editar</button>
        </div>
    `;

    card.querySelector('.edit-btn').onclick = () => openModal(user);
    usersList.appendChild(card);
}

function openModal(user) {
    currentUser = user;
    modal.style.display = 'flex';

    const iconMap = {
        masculino: '../../../../img/user-h/favicon.ico',
        femenino: '../../../../img/user-m/favicon.ico',
        otro: '../../../../img/user-n/favicon.ico'
    };
    const icon = iconMap[user.sex] || '../../../../img/user-n/favicon.ico';

    modalUserCard.innerHTML = `
        <div style="text-align:center;margin-bottom:20px;">
            <img src="${icon}" alt="Usuario" style="width:80px;height:80px;border-radius:50%;border:3px solid #ddd;">
            <h3 style="margin:10px 0 0;color:#3A5795;">${user.fullName}</h3>
        </div>

        ${createField('fullName', 'Nombre Completo', user.fullName, 'text')}
        ${createField('username', 'Usuario', user.username, 'text')}
        ${createField('email', 'Email', user.email, 'email')}
        ${createField('birthDate', 'Fecha Nacimiento', user.birthDate, 'date')}
        ${createField('sex', 'Sexo', user.sex, 'select', ['masculino','femenino','otro'])}
        ${createField('module', 'Módulo', user.module, 'select', ['Salud','Album','Personal'])}
        ${createField('category', 'Categoría', user.category, 'select', ['Administrador','Coordinadora','Corporativa','Operador','Laboratorio'])}
    `;
}

function createField(field, label, value, type, options = []) {
    const display = type === 'select' ? value.charAt(0).toUpperCase() + value.slice(1) : value;
    const input = type === 'select'
        ? `<select class="field-input">${options.map(o => `<option value="${o}" ${o===value?'selected':''}>${o.charAt(0).toUpperCase()+o.slice(1)}</option>`).join('')}</select>`
        : `<input type="${type}" class="field-input" value="${value}">`;

    return `
        <div class="modal-field" data-field="${field}">
            <div class="field-label">${label}:</div>
            <div class="field-value">${display}</div>
            <svg class="edit-pencil" viewBox="0 0 24 24"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04a.996.996 0 0 0 0-1.41l-2.34-2.34a.996.996 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/></svg>
            <div class="field-input-group">
                ${input}
                <div class="field-actions">
                    <button class="action-btn"><svg class="save-icon" viewBox="0 0 24 24"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg></button>
                    <button class="action-btn"><svg class="cancel-icon" viewBox="0 0 24 24"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg></button>
                </div>
            </div>
        </div>
    `;
}

modalUserCard.onclick = async (e) => {
    const field = e.target.closest('.modal-field');
    if (!field) return;

    const fieldName = field.dataset.field;
    const valueEl = field.querySelector('.field-value');
    const pencil = field.querySelector('.edit-pencil');
    const inputGroup = field.querySelector('.field-input-group');
    const input = inputGroup.querySelector('.field-input');
    const saveBtn = inputGroup.querySelector('.action-btn:first-child');
    const cancelBtn = inputGroup.querySelector('.action-btn:last-child');

    if (e.target.closest('.edit-pencil')) {
        valueEl.style.display = 'none';
        pencil.style.display = 'none';
        inputGroup.style.display = 'flex';
        input.focus();
    }

    if (e.target.closest('.action-btn:first-child')) {
        const newVal = input.value.trim();
        if (newVal === currentUser[fieldName]) {
            closeField(field);
            return;
        }
        try {
            await updateDoc(doc(db, 'users', currentUser.id), { [fieldName]: newVal });
            currentUser[fieldName] = newVal;
            valueEl.textContent = fieldName === 'sex' || fieldName === 'module' || fieldName === 'category'
                ? newVal.charAt(0).toUpperCase() + newVal.slice(1)
                : newVal;
            closeField(field);
            showMsg('Guardado', 'success');
            refreshCard(currentUser);
        } catch (err) {
            alert('Error al guardar');
        }
    }

    if (e.target.closest('.action-btn:last-child')) {
        closeField(field);
    }
};

function closeField(field) {
    field.querySelector('.field-value').style.display = 'block';
    field.querySelector('.edit-pencil').style.display = 'block';
    field.querySelector('.field-input-group').style.display = 'none';
}

function refreshCard(user) {
    const old = document.querySelector(`.user-card[data-id="${user.id}"]`);
    if (old) {
        const parent = old.parentNode;
        parent.removeChild(old);
        renderUserCard(user);
    }
}

function showMsg(text, type) {
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

closeModal.onclick = () => modal.style.display = 'none';
window.onclick = (e) => { if (e.target === modal) modal.style.display = 'none'; };
searchInput.oninput = (e) => loadUsers(e.target.value);

loadUsers();