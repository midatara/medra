import { collection, getDocs, query, where, doc, updateDoc, orderBy } from "https://www.gstatic.com/firebasejs/10.13.1/firebase-firestore.js";

let db = null;

export function initReportesDb(database) {
    db = database;
}

/**
 * Rellena datos faltantes en pacientes desde la colección "reportes"
 * SOLO escribe si el campo está vacío o es diferente
 * NUNCA usa cache temporal → todo queda en Firestore
 */
export async function completarDatosPacientes(pacientes) {
    if (!pacientes || pacientes.length === 0 || !db) return pacientes;

    const promesas = pacientes.map(async (p) => {
        // Si ya tiene todos los datos → no hacer nada
        if (
            p.prevision &&
            p.convenio &&
            Array.isArray(p.cirugias) && p.cirugias.length > 0 &&
            p.cirugiaSeleccionada
        ) {
            return p; // Ya está completo
        }

        // Si no tiene admisión → no puede buscar
        if (!p.admision) return p;

        try {
            const q = query(
                collection(db, "reportes"),
                where("admision", "==", p.admision.trim()),
                orderBy("fecha", "desc")
            );
            const snapshot = await getDocs(q);

            if (snapshot.empty) return p; // No hay reportes

            const cirugias = [];
            let isapre = p.prevision || '';
            let convenio = p.convenio || '';

            snapshot.docs.forEach(d => {
                const r = d.data();
                // Recolectar cirugías únicas
                if (r.descripcion && !cirugias.some(c => c.descripcion === r.descripcion)) {
                    cirugias.push({
                        descripcion: r.descripcion.trim(),
                        fecha: r.fecha || ''
                    });
                }
                // Solo rellenar si está vacío
                if (!isapre && r.isapre) isapre = r.isapre;
                if (!convenio && r.convenio) convenio = r.convenio;
            });

            // Determinar cirugía seleccionada (solo si no tiene)
            let cirugiaSeleccionada = p.cirugiaSeleccionada;
            if (!cirugiaSeleccionada && cirugias.length > 0) {
                cirugiaSeleccionada = cirugias[0].descripcion;
            }

            // Preparar solo los campos que faltan
            const updates = {};
            if (!p.prevision && isapre) updates.prevision = isapre;
            if (!p.convenio && convenio) updates.convenio = convenio;
            if ((!p.cirugias || p.cirugias.length === 0) && cirugias.length > 0) {
                updates.cirugias = cirugias;
            }
            if (!p.cirugiaSeleccionada && cirugiaSeleccionada) {
                updates.cirugiaSeleccionada = cirugiaSeleccionada;
            }

            // Solo actualizar si hay algo que escribir
            if (Object.keys(updates).length > 0) {
                const pacienteRef = doc(db, "pacientes_consignaciones", p.id);
                await updateDoc(pacienteRef, updates);
                console.log(`Rellenado paciente ${p.id}:`, updates);
            }

            // Devolver paciente con datos actualizados
            return {
                ...p,
                prevision: isapre,
                convenio: convenio,
                cirugias: cirugias,
                cirugiaSeleccionada: cirugiaSeleccionada
            };

        } catch (err) {
            console.warn(`Error al procesar admisión ${p.admision}:`, err);
            return p;
        }
    });

    return Promise.all(promesas);
}