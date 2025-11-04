// pacientes-reportes.js
let db = null;
const cacheReportes = new Map();

export function initReportesDb(database) {
    db = database;
}

export async function completarDatosPacientes(pacientes) {
    if (!pacientes || pacientes.length === 0 || !db) return pacientes;

    const promesas = pacientes.map(async (p) => {
        if (!p.admision) return p;

        // Si ya está en caché
        if (cacheReportes.has(p.admision)) {
            return { ...p, ...cacheReportes.get(p.admision) };
        }

        try {
            const q = query(
                collection(db, "reportes"),
                where("admision", "==", p.admision.trim())
            );
            const snapshot = await getDocs(q);

            let datos = { prevision: '', convenio: '', cirugia: '' };

            if (!snapshot.empty) {
                const reporte = snapshot.docs[0].data();
                datos = {
                    prevision: reporte.isapre || '',
                    convenio: reporte.convenio || '',
                    cirugia: reporte.descripcion || ''
                };
            }

            cacheReportes.set(p.admision, datos);
            return { ...p, ...datos };

        } catch (err) {
            console.warn(`Error buscando admisión ${p.admision}:`, err);
            return p;
        }
    });

    return Promise.all(promesas);
}