// pacientes-reportes.js
import { getFirestore, collection, getDocs, query, where } from "https://www.gstatic.com/firebasejs/10.13.1/firebase-firestore.js";

const db = getFirestore();

// Cache para evitar múltiples consultas por la misma admisión
const cacheReportes = new Map();

export async function completarDatosPacientes(pacientes) {
    if (!pacientes || pacientes.length === 0) return;

    const promesas = pacientes.map(async (p) => {
        if (!p.admision) return p;

        // Si ya está en caché, usar caché
        if (cacheReportes.has(p.admision)) {
            const datos = cacheReportes.get(p.admision);
            return { ...p, ...datos };
        }

        try {
            const q = query(
                collection(db, "reportes"),
                where("admision", "==", p.admision.trim())
            );
            const snapshot = await getDocs(q);

            if (!snapshot.empty) {
                const reporte = snapshot.docs[0].data();
                const datos = {
                    prevision: reporte.isapre || '',
                    convenio: reporte.convenio || '',
                    cirugia: reporte.descripcion || ''
                };
                // Guardar en caché
                cacheReportes.set(p.admision, datos);
                return { ...p, ...datos };
            } else {
                cacheReportes.set(p.admision, { prevision: '', convenio: '', cirugia: '' });
                return p;
            }
        } catch (err) {
            console.warn(`Error buscando admisión ${p.admision}:`, err);
            return p;
        }
    });

    return Promise.all(promesas);
}