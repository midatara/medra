import { getFirestore, collection, getDocs, addDoc, deleteDoc, doc, serverTimestamp, writeBatch } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import { showToast, showLoading, hideLoading } from './ingresos.js';

const db = getFirestore();

function showTraspasoModal() {
    const modal = document.getElementById('traspasoModal');
    if (!modal) {
        console.error('Modal de traspaso no encontrado');
        return;
    }

    modal.style.display = 'block';

    const closeBtn = modal.querySelector('.close');
    const confirmBtn = document.getElementById('confirmTraspasarBtn');
    const cancelBtn = document.getElementById('cancelTraspasarBtn');

    const closeModal = () => modal.style.display = 'none';
    closeBtn.onclick = closeModal;
    cancelBtn.onclick = closeModal;
    window.onclick = (e) => { if (e.target === modal) closeModal(); };

    confirmBtn.onclick = async () => {
        await traspasarRegistros();
        closeModal();
    };
}

async function traspasarRegistros() {
    showLoading();
    try {
        const ingresosSnap = await getDocs(collection(db, 'consigna_ingresos'));
        
        if (ingresosSnap.empty) {
            showToast('No hay registros para traspasar', 'info');
            hideLoading();
            return;
        }

        // Usamos batch para mejor rendimiento y atomicidad
        const batch = writeBatch(db);
        const historialRef = collection(db, 'consigna_historial');

        ingresosSnap.forEach((docSnap) => {
            const data = docSnap.data();

            // Agregamos el campo estado: "INGRESADO" y la fecha de traspaso
            const nuevoRegistro = {
                ...data,
                estado: 'INGRESADO',           // ← NUEVO CAMPO
                traspasoAt: serverTimestamp()  // ← Fecha exacta del traspaso
            };

            const nuevoDocRef = doc(historialRef);
            batch.set(nuevoDocRef, nuevoRegistro);
            batch.delete(doc(db, 'consigna_ingresos', docSnap.id));
        });

        await batch.commit();

        // Limpiar tabla y botón
        const tbody = document.querySelector('#registrarTable tbody');
        if (tbody) {
            tbody.innerHTML = '<tr><td colspan="15">No hay registros</td></tr>';
        }
        const btn = document.getElementById('traspasarBtn');
        if (btn) btn.disabled = true;

        showToast(`Se traspasaron ${ingresosSnap.size} registro(s) con estado INGRESADO`, 'success');
        
    } catch (error) {
        console.error('Error en traspaso:', error);
        showToast('Error al traspasar: ' + error.message, 'error');
    } finally {
        hideLoading();
    }
}

function initTraspasoButton() {
    const btn = document.getElementById('traspasarBtn');
    if (btn) {
        btn.addEventListener('click', showTraspasoModal);
    }
}

document.addEventListener('DOMContentLoaded', initTraspasoButton);

export { showTraspasoModal };