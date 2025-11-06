import { doc, updateDoc, collection, getDocs, query, where } from "https://www.gstatic.com/firebasejs/10.13.1/firebase-firestore.js";

let db = null;

export function initCalculosDb(database) {
    db = database;
}

export function calcularMargen(precio) {
    if (!precio || isNaN(precio)) return '';
    const p = Number(precio);
    if (p < 301) return "500%";
    if (p < 1001) return "400%";
    if (p < 5001) return "300%";
    if (p < 10001) return "250%";
    if (p < 25001) return "200%";
    if (p < 50001) return "160%";
    if (p < 100001) return "140%";
    if (p < 200001) return "80%";
    if (p < 10000000) return "50%";
    return '';
}

function parsePorcentaje(porcentajeStr) {
    if (!porcentajeStr) return 0;
    const match = porcentajeStr.toString().trim().match(/([\d.]+)%?/);
    return match ? parseFloat(match[1]) / 100 : 0;
}

export function calcularVenta(carga) {
    const { precio, cantidad, atributo, prevision } = carga;
    const p = Number(precio);
    const c = Number(cantidad);
    const attr = (atributo || "").toString().trim().toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    const prev = (prevision || "").toString().trim().toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

    if (isNaN(p) || isNaN(c) || p <= 0 || c <= 0) return null;

    let factor = 0;
    if (attr === "CONSIGNACION") {
        const margenStr = carga.margen?.toString().trim();
        const match = margenStr?.match(/([\d.]+)%?/);
        if (!match) return null;
        factor = parseFloat(match[1]) / 100;
    } else if (attr === "COTIZACION") {
        factor = prev === "ISL" ? 1.0 : 0.3;
    } else {
        return null;
    }

    const precioConIncremento = p + (p * factor);
    return Math.round(precioConIncremento * c * 100) / 100;
}

// === NUEVA FUNCIÓN: Busca totalPaciente en pacientes_consignaciones ===
async function asignarTotalCotizacionDesdePacientes(cargas) {
    if (!cargas.length || !db) return;

    const normalize = (str) => (str || '').toString().trim().toUpperCase()
        .normalize("NFD").replace(/[\u0300-\u036f]/g, "");

    // 1. Obtener todas las admisiones+proveedores únicas de las cargas
    const grupos = new Map();
    cargas.forEach(c => {
        const adm = normalize(c.admision);
        const prov = normalize(c.proveedor);
        const clave = `${adm}|${prov}`;
        if (!grupos.has(clave)) {
            grupos.set(clave, { admision: c.admision, proveedor: c.proveedor, cargas: [] });
        }
        grupos.get(clave).cargas.push(c);
    });

    // 2. Consultar Firestore por cada grupo
    const promesas = Array.from(grupos.values()).map(async (grupo) => {
        const q = query(
            collection(db, "pacientes_consignaciones"),
            where("admision", "==", grupo.admision),
            where("proveedor", "==", grupo.proveedor)
        );

        try {
            const snapshot = await getDocs(q);
            if (snapshot.empty) return;

            // Tomamos el primer registro (asumimos que es único o todos tienen mismo totalPaciente)
            const pacienteDoc = snapshot.docs[0];
            const totalPaciente = Number(pacienteDoc.data().totalPaciente) || 0;

            // Asignar a todas las cargas del grupo
            grupo.cargas.forEach(carga => {
                const actual = Number(carga.totalCotizacion) || 0;
                if (Math.abs(actual - totalPaciente) > 0.01) {
                    carga.totalCotizacion = totalPaciente;
                }
            });

            return { grupo, totalPaciente };
        } catch (err) {
            console.warn(`Error buscando paciente para admisión ${grupo.admision} / proveedor ${grupo.proveedor}:`, err);
            return null;
        }
    });

    const resultados = await Promise.all(promesas);
    const updates = [];

    // 3. Aplicar actualizaciones en Firestore
    resultados.forEach(resultado => {
        if (!resultado) return;
        resultado.grupo.cargas.forEach(carga => {
            const actual = Number(carga.totalCotizacion) || 0;
            if (Math.abs(actual - resultado.totalPaciente) > 0.01) {
                updates.push({
                    id: carga.id,
                    update: { totalCotizacion: resultado.totalPaciente }
                });
            }
        });
    });

    if (updates.length > 0) {
        const promesasUpdates = updates.map(async ({ id, update }) => {
            try {
                const ref = doc(db, "cargas_consignaciones", id);
                await updateDoc(ref, update);
            } catch (err) {
                console.warn(`Error actualizando totalCotizacion en carga ${id}:`, err);
            }
        });
        await Promise.all(promesasUpdates);
    }
}

// === CÁLCULO DE totalPaciente (suma de totalItem por grupo) ===
function calcularTotalPacientePorGrupo(cargas) {
    const normalize = (str) => (str || '').toString().trim().toUpperCase()
        .normalize("NFD").replace(/[\u0300-\u036f]/g, "");

    const grupos = new Map();

    cargas.forEach(c => {
        const adm = normalize(c.admision);
        const prov = normalize(c.proveedor);
        const clave = `${adm}|${prov}`;
        const totalItem = Number(c.totalItem) || 0;

        if (!grupos.has(clave)) grupos.set(clave, 0);
        grupos.set(clave, grupos.get(clave) + totalItem);
    });

    const updates = [];
    cargas.forEach(c => {
        const adm = normalize(c.admision);
        const prov = normalize(c.proveedor);
        const clave = `${adm}|${prov}`;
        const totalGrupo = grupos.get(clave) || 0;
        const actual = Number(c.totalPaciente) || 0;

        if (Math.abs(actual - totalGrupo) > 0.01) {
            c.totalPaciente = totalGrupo;
            updates.push({
                id: c.id,
                update: { totalPaciente: totalGrupo }
            });
        }
    });

    return updates;
}

export async function procesarMargenes(cargas) {
    if (!cargas || cargas.length === 0 || !db) return cargas;

    const promesas = cargas.map(async (c) => {
        let needsUpdate = false;
        const updates = {};

        // === Margen ===
        const precio = Number(c.precio);
        const margenActual = c.margen?.toString().trim();
        const margenCalculado = calcularMargen(precio);

        if (!margenCalculado) {
            if (margenActual && margenActual !== '') {
                updates.margen = '';
                c.margen = '';
                needsUpdate = true;
            }
        } else if (!margenActual || margenActual !== margenCalculado) {
            updates.margen = margenCalculado;
            c.margen = margenCalculado;
            needsUpdate = true;
        }

        // === Venta ===
        const ventaCalculada = calcularVenta(c);
        const ventaActual = c.venta != null ? Number(c.venta) : null;

        if (ventaCalculada !== null) {
            if (ventaActual == null || Math.abs(ventaActual - ventaCalculada) > 0.01) {
                updates.venta = ventaCalculada;
                c.venta = ventaCalculada;
                needsUpdate = true;
            }
        } else {
            if (ventaActual != null) {
                updates.venta = null;
                c.venta = null;
                needsUpdate = true;
            }
        }

        if (needsUpdate) {
            try {
                const cargaRef = doc(db, "cargas_consignaciones", c.id);
                await updateDoc(cargaRef, updates);
            } catch (err) {
                console.warn(`Error actualizando márgenes/venta ${c.id}:`, err);
            }
        }

        return c;
    });

    const cargasConMargen = await Promise.all(promesas);

    // === 1. totalPaciente = suma de totalItem (misma admisión + proveedor) ===
    const updatesTotalPaciente = calcularTotalPacientePorGrupo(cargasConMargen);
    if (updatesTotalPaciente.length > 0) {
        await Promise.all(updatesTotalPaciente.map(async ({ id, update }) => {
            try {
                const ref = doc(db, "cargas_consignaciones", id);
                await updateDoc(ref, update);
            } catch (err) {
                console.warn(`Error actualizando totalPaciente ${id}:`, err);
            }
        }));
    }

    // === 2. totalCotizacion = totalPaciente de pacientes_consignaciones ===
    await asignarTotalCotizacionDesdePacientes(cargasConMargen);

    return cargasConMargen;
}