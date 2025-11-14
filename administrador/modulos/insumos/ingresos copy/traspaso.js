import { getFirestore, collection, getDocs, addDoc, deleteDoc, doc, serverTimestamp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
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

    closeBtn.onclick = () => {
        modal.style.display = 'none';
    };

    cancelBtn.onclick = () => {
        modal.style.display = 'none';
    };

    confirmBtn.onclick = async () => {
        await traspasarRegistros();
        modal.style.display = 'none';
    };

    window.onclick = (event) => {
        if (event.target === modal) {
            modal.style.display = 'none';
        }
    };
}

async function traspasarRegistros() {
    showLoading();
    try {
        const querySnapshot = await getDocs(collection(db, 'consigna_ingresos'));
        if (querySnapshot.empty) {
            showToast('No hay registros para traspasar', 'error');
            hideLoading();
            return;
        }

        const traspasoPromises = [];
        const deletePromises = [];
        querySnapshot.forEach((docSnapshot) => {
            const data = docSnapshot.data();
            traspasoPromises.push(
                addDoc(collection(db, 'consigna_historial'), {
                    ...data,
                    traspasoAt: serverTimestamp()
                })
            );
            deletePromises.push(deleteDoc(doc(db, 'consigna_ingresos', docSnapshot.id)));
        });

        await Promise.all(traspasoPromises);
        await Promise.all(deletePromises);

        const tbody = document.querySelector('#registrarTable tbody');
        if (tbody) {
            tbody.innerHTML = '<tr><td colspan="15">No hay registros para mostrar</td></tr>';
        }

        const traspasarBtn = document.getElementById('traspasarBtn');
        if (traspasarBtn) {
            traspasarBtn.disabled = true;
        }

        showToast('Registros traspasados exitosamente', 'success');
    } catch (error) {
        showToast('Error al traspasar los registros: ' + error.message, 'error');
        console.error('Error al traspasar:', error);
    } finally {
        hideLoading();
    }
}

function initTraspasoButton() {
    const traspasarBtn = document.getElementById('traspasarBtn');
    if (!traspasarBtn) {
        console.error('Botón Traspasar con ID "traspasarBtn" no encontrado');
        return;
    }
    traspasarBtn.addEventListener('click', showTraspasoModal);
}

document.addEventListener('DOMContentLoaded', () => {
    initTraspasoButton();
});

export { showTraspasoModal };