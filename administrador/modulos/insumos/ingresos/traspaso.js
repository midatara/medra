import { getFirestore, collection, getDocs, addDoc, deleteDoc, doc, serverTimestamp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import { showToast, showLoading, hideLoading } from './ingresos.js'; // Importar funciones compartidas

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
        // Obtener todos los registros de consigna_ingresos
        const querySnapshot = await getDocs(collection(db, 'consigna_ingresos'));
        if (querySnapshot.empty) {
            showToast('No hay registros para traspasar', 'error');
            hideLoading();
            return;
        }

        // Copiar cada registro a consigna_historial
        const traspasoPromises = [];
        const deletePromises = [];
        querySnapshot.forEach((docSnapshot) => {
            const data = docSnapshot.data();
            // Agregar a consigna_historial con timestamp de traspaso
            traspasoPromises.push(
                addDoc(collection(db, 'consigna_historial'), {
                    ...data,
                    traspasoAt: serverTimestamp()
                })
            );
            // Marcar para eliminación
            deletePromises.push(deleteDoc(doc(db, 'consigna_ingresos', docSnapshot.id)));
        });

        // Ejecutar todas las operaciones de traspaso
        await Promise.all(traspasoPromises);
        // Ejecutar todas las eliminaciones
        await Promise.all(deletePromises);

        // Limpiar la tabla en el frontend
        const tbody = document.querySelector('#registrarTable tbody');
        if (tbody) {
            tbody.innerHTML = '<tr><td colspan="15">No hay registros para mostrar</td></tr>';
        }

        // Deshabilitar el botón de traspaso
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

// Inicializar al cargar el DOM
document.addEventListener('DOMContentLoaded', () => {
    initTraspasoButton();
});

// Exportar funciones para uso en ingresos.js
export { showTraspasoModal };