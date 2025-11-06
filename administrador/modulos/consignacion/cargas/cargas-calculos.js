import { doc, updateDoc } from "https://www.gstatic.com/firebasejs/10.13.1/firebase-firestore.js";

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
    const attr = (atributo || "")
        .toString()
        .trim()
        .toUpperCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "");
    const prev = (prevision || "")
        .toString()
        .trim()
        .toUpperCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "");

    if (isNaN(p) || isNaN(c) || p <= 0 || c <= 0) return null;

    let factor = 0;
    if (attr === "CONSIGNACION") {
        const margenStr = carga.margen?.toString().trim();
        const match = margenStr?.match(/([\d.]+)%?/);
        if (!match) return null;
        factor = parseFloat(match[1]) / 100;
    }
    else if (attr === "COTIZACION") {
        factor = prev === "ISL" ? 1.0 : 0.3;
    }
    else {
        return null;
    }

    const precioConIncremento = p + (p * factor);
    return Math.round(precioConIncremento * c * 100) / 100;
}

/**
 * NUEVA FUNCIÓN: Calcula totalPaciente como suma de totalItem
 * para registros con misma admision + proveedor
 */
function calcularTotalPacientePorGrupo(cargas) {
    // Normalizamos admision y proveedor para comparación
    const normalize = (str) => (str || '').toString().trim().toUpperCase()
        .normalize("NFD").replace(/[\u0300-\u036f]/g, "");

    const grupos = new Map(); // clave: "admission|proveedor" → total

    // Paso 1: Sumar totalItem por grupo
    cargas.forEach(c => {
        const admision = normalize(c.admision);
        const proveedor = normalize(c.proveedor);
        const clave = `${admision}|${proveedor}`;
        const totalItem = Number(c.totalItem) || 0;

        if (!grupos.has(clave)) {
            grupos.set(clave, 0);
        }
        grupos.set(clave, grupos.get(clave) + totalItem);
    });

    // Paso 2: Asignar el total del grupo a cada carga
    const updates = [];
    cargas.forEach(c => {
        const admision = normalize(c.admision);
        const proveedor = normalize(c.proveedor);
        const clave = `${admision}|${proveedor}`;
        const totalGrupo = grupos.get(clave) || 0;
        const totalPacienteActual = Number(c.totalPaciente) || 0;

        // Solo actualizamos si cambió
        if (Math.abs(totalPacienteActual - totalGrupo) > 0.01) {
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

        // === Cálculo de margen ===
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

        // === Cálculo de venta ===
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

        // === Aplicar actualización si es necesario ===
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

    // === NUEVO: Cálculo de totalPaciente por grupo ===
    const updatesTotalPaciente = calcularTotalPacientePorGrupo(cargasConMargen);

    if (updatesTotalPaciente.length > 0) {
        const promesasUpdates = updatesTotalPaciente.map(async ({ id, update }) => {
            try {
                const ref = doc(db, "cargas_consignaciones", id);
                await updateDoc(ref, update);
            } catch (err) {
                console.warn(`Error actualizando totalPaciente ${id}:`, err);
            }
        });
        await Promise.all(promesasUpdates);
    }

    return cargasConMargen;
}