import { initializeApp } from "https://www.gstatic.com/firebasejs/10.13.1/firebase-app.js";
import { getAuth, onAuthStateChanged, reauthenticateWithCredential, EmailAuthProvider, updatePassword } from "https://www.gstatic.com/firebasejs/10.13.1/firebase-auth.js";

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

const form = document.getElementById('changePasswordForm');
const message = document.getElementById('message');
const changePasswordBtn = document.querySelector('.btn-crear');
const newPasswordInput = document.getElementById('newPassword');
const repeatNewPasswordInput = document.getElementById('repeatNewPassword');
const repeatMatchIndicator = document.getElementById('repeatMatch');

function validatePassword(password) {
    const minLength = 8;
    const maxLength = 20;
    const hasUpperCase = /[A-Z]/.test(password);
    const hasLowerCase = /[a-z]/.test(password);
    const hasNumber = /[0-9]/.test(password);
    const hasSpecialChar = /[!@#$%^&*+\-(),.?":{}|<>]/.test(password);

    return {
        length: password.length >= minLength && password.length <= maxLength,
        uppercase: hasUpperCase,
        lowercase: hasLowerCase,
        number: hasNumber,
        special: hasSpecialChar,
        error: !password.length ? 'Por favor, ingrese una contraseña.' :
                password.length < minLength || password.length > maxLength ? 'La contraseña debe tener entre 8 y 20 caracteres.' :
                !hasUpperCase ? 'La contraseña debe contener al menos una letra mayúscula.' :
                !hasLowerCase ? 'La contraseña debe contener al menos una letra minúscula.' :
                !hasNumber ? 'La contraseña debe contener al menos un número.' :
                !hasSpecialChar ? 'La contraseña debe contener al menos un carácter especial (!@#$%^&*+-(),.?":{}|<>).' : null
    };
}

function updatePasswordRequirements(password) {
    const validation = validatePassword(password);
    document.getElementById('req-length').classList.toggle('valid', validation.length);
    document.getElementById('req-length').classList.toggle('invalid', !validation.length);
    document.getElementById('req-uppercase').classList.toggle('valid', validation.uppercase);
    document.getElementById('req-uppercase').classList.toggle('invalid', !validation.uppercase);
    document.getElementById('req-lowercase').classList.toggle('valid', validation.lowercase);
    document.getElementById('req-lowercase').classList.toggle('invalid', !validation.lowercase);
    document.getElementById('req-number').classList.toggle('valid', validation.number);
    document.getElementById('req-number').classList.toggle('invalid', !validation.number);
    document.getElementById('req-special').classList.toggle('valid', validation.special);
    document.getElementById('req-special').classList.toggle('invalid', !validation.special);
}

function updateRepeatMatchIndicator() {
    const newPassword = newPasswordInput.value;
    const repeatNewPassword = repeatNewPasswordInput.value;
    const isMatch = newPassword === repeatNewPassword && newPassword.length > 0;
    repeatMatchIndicator.classList.toggle('valid', isMatch);
    repeatMatchIndicator.classList.toggle('invalid', !isMatch);
}

newPasswordInput.addEventListener('input', () => {
    const password = newPasswordInput.value;
    updatePasswordRequirements(password);
    updateRepeatMatchIndicator();
});

repeatNewPasswordInput.addEventListener('input', updateRepeatMatchIndicator);

document.querySelectorAll('.toggle-password').forEach(toggle => {
    toggle.addEventListener('click', () => {
        const targetId = toggle.getAttribute('data-target');
        const input = document.getElementById(targetId);
        const isPassword = input.type === 'password';
        input.type = isPassword ? 'text' : 'password';
        toggle.classList.toggle('fa-eye', !isPassword);
        toggle.classList.toggle('fa-eye-slash', isPassword);
    });
});

onAuthStateChanged(auth, (user) => {
    if (!user) {
        showMessage('Debes estar autenticado para cambiar la contraseña.', 'error');
        setTimeout(() => {
            window.location.href = '../../../../index.html';
        }, 2000);
    }
});

form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const currentPassword = document.getElementById('currentPassword').value;
    const newPassword = document.getElementById('newPassword').value;
    const repeatNewPassword = document.getElementById('repeatNewPassword').value;

    if (!currentPassword || !newPassword || !repeatNewPassword) {
        showMessage('Por favor, complete todos los campos.', 'error');
        return;
    }

    if (newPassword !== repeatNewPassword) {
        showMessage('Las nuevas contraseñas no coinciden.', 'error');
        return;
    }

    const validation = validatePassword(newPassword);
    if (validation.error) {
        showMessage(validation.error, 'error');
        return;
    }

    changePasswordBtn.disabled = true;
    changePasswordBtn.textContent = 'Cambiando...';
    showMessage('Procesando cambio de contraseña...', 'loading');

    try {
        const user = auth.currentUser;
        if (!user) {
            throw new Error('No hay usuario autenticado.');
        }

        const credential = EmailAuthProvider.credential(user.email, currentPassword);
        await reauthenticateWithCredential(user, credential);

        await updatePassword(user, newPassword);

        showMessage('Contraseña cambiada exitosamente.', 'success');
        form.reset();
        updatePasswordRequirements('');
        updateRepeatMatchIndicator();
    } catch (error) {
        console.error('Error:', error);
        if (error.code === 'auth/invalid-credential') {
            showMessage('La contraseña actual no corresponde.', 'error');
        } else if (error.code === 'auth/too-many-requests') {
            showMessage('Demasiados intentos. Intente de nuevo más tarde.', 'error');
        } else {
            showMessage('Error al cambiar la contraseña: ' + error.message, 'error');
        }
        resetButtonState();
    }
});

function showMessage(text, type) {
    message.textContent = text;
    message.className = type;
    message.style.display = 'block';
    if (type !== 'loading') {
        setTimeout(() => {
            message.style.display = 'none';
        }, 5000);
    }
}

function resetButtonState() {
    changePasswordBtn.disabled = false;
    changePasswordBtn.textContent = 'Cambiar Contraseña';
}