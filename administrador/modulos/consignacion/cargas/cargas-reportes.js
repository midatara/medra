import { collection, getDocs, query, where, doc, updateDoc, orderBy } from "https://www.gstatic.com/firebasejs/10.13.1/firebase-firestore.js";

let db = null;

export function initReportesDb(database) {
    db = database;
}

export async function completarDatosCargas(cargas) {
    if (!cargas || cargas.length === 0 || !db) return cargas;

    const promesas = cargas.map(async (c) => {
        if (c.prevision && c.convenio && Array.isArray(c.cirugias) && c.cirugias.length > 0 && c.cirugiaSeleccionada) {
            return c;
        }

        if (!c.admision) return c;

        try {
            const q = query(collection(db, "reportes"), where("admision", "==", c.admision.trim()), orderBy("fecha", "desc"));
            const snapshot = await getDocs(q);

            if (snapshot.empty) return c;

            const cirugias = [];
            let isapre = c.prevision || '';
            let convenio = c.convenio || '';

            snapshot.docs.forEach(d => {
                const r = d.data();
                if (r.descripcion && !cirugias.some(cr => cr.descripcion === r.descripcion)) {
                    cirugias.push({ descripcion: r.descripcion.trim(), fecha: r.fecha || '' });
                }
                if (!isapre && r.isapre) isapre = r.isapre;
                if (!convenio && r.convenio) convenio = r.convenio;
            });

            let cirugiaSeleccionada = c.cirugiaSeleccionada;
            if (!cirugiaSeleccionada && cirugias.length > 0) cirugiaSeleccionada = cirugias[0].descripcion;

            const updates = {};
            if (!c.prevision && isapre) updates.prevision = isapre;
            if (!c.convenio && convenio) updates.convenio = convenio;
            if ((!c.cirugias || c.cirugias.length === 0) && cirugias.length > 0) updates.cirugias = cirugias;
            if (!c.cirugiaSeleccionada && cirugiaSeleccionada) updates.cirugiaSeleccionada = cirugiaSeleccionada;

            if (Object.keys(updates).length > 0) {
                const cargaRef = doc(db, "cargas_consignaciones", c.id);
                await updateDoc(cargaRef, updates);
            }

            return { ...c, prevision: isapre, convenio, cirugias, cirugiaSeleccionada };
        } catch (err) {
            console.warn(`Error al procesar admisión ${c.admision}:`, err);
            return c;
        }
    });

    return Promise.all(promesas);
}

export async function vincularGuias(cargas) {
    if (!cargas || cargas.length === 0 || !db) return cargas;

    const docDeliveries = cargas
        .filter(c => c.docDelivery != null && String(c.docDelivery).trim() !== '')
        .map(c => String(c.docDelivery).trim().toUpperCase());

    console.log("DocDeliveries normalizados para buscar en guías:", docDeliveries);

    if (docDeliveries.length === 0) {
        return cargas.map(c => ({ ...c, guiaRelacionada: null }));
    }

    try {
        const q = query(collection(db, "guias_medtronic"), where("folioRef", "in", docDeliveries));
        const snapshot = await getDocs(q);

        console.log(`Guías encontradas en Firestore: ${snapshot.size}`);

        const guiasMap = new Map();
        snapshot.docs.forEach(doc => {
            const data = doc.data();
            const folioRef = String(data.folioRef || '').trim().toUpperCase();
            if (folioRef) {
                guiasMap.set(folioRef, {
                    id: doc.id,
                    folio: data.folio || '',
                    fchEmis: data.fchEmis || '',
                    rznSoc: data.rznSoc || '',
                    folioRef: data.folioRef || '',
                    fullData: data.fullData || null
                });
            }
        });

        return cargas.map(c => {
            const key = String(c.docDelivery || '').trim().toUpperCase();
            const guia = key ? guiasMap.get(key) : null;
            if (guia) console.log(`Coincidencia: docDelivery "${c.docDelivery}" → Guía folio ${guia.folio}`);
            return { ...c, guiaRelacionada: guia || null };
        });
    } catch (err) {
        console.error('Error al vincular guías:', err);
        return cargas.map(c => ({ ...c, guiaRelacionada: null }));
    }
}

export async function enriquecerSubfilasConReferencias(cargas) {
    if (!cargas || cargas.length === 0 || !db) return cargas;

    const cache = new Map();
    const refsSet = new Set();

    // Recolectar referencias de items
    cargas.forEach(carga => {
        const items = Array.isArray(carga.items) ? carga.items : [];
        items.forEach(item => {
            const ref = item.referencia?.toString().trim();
            if (ref) refsSet.add(ref);
        });
    });

    if (refsSet.size === 0) return cargas;

    const refsArray = Array.from(refsSet);
    const chunks = [];
    for (let i = 0; i < refsArray.length; i += 30) {
        chunks.push(refsArray.slice(i, i + 30));
    }

    try {
        const queries = chunks.map(chunk =>
            getDocs(query(collection(db, "referencias_implantes"), where("referencia", "in", chunk)))
        );
        const snapshots = await Promise.all(queries);

        snapshots.forEach(snap => {
            snap.docs.forEach(doc => {
                const d = doc.data();
                const ref = d.referencia?.toString().trim();
                if (ref) {
                    cache.set(ref, {
                        codigo: d.codigo || '—',
                        descripcion: d.descripcion || '—'
                    });
                }
            });
        });

        // Aplicar a cada carga
        return cargas.map(carga => {
            if (!Array.isArray(carga.items)) return carga;

            const itemsActualizados = carga.items.map(item => {
                const ref = item.referencia?.toString().trim();
                if (!ref) {
                    return { ...item, codigo: '—', descripcion: '—', _referenciaSinCoincidir: false };
                }

                const match = cache.get(ref);
                if (match) {
                    return { ...item, ...match, _referenciaSinCoincidir: false };
                } else {
                    return {
                        ...item,
                        codigo: 'NO ENCONTRADO',
                        descripcion: '',
                        _referenciaSinCoincidir: true
                    };
                }
            });

            return { ...carga, items: itemsActualizados };
        });

    } catch (err) {
        console.error('Error enriqueciendo referencias:', err);
        return cargas;
    }
}