// resizeColumnsReportes.js
function initColumnResizingReportes() {
    const table = document.getElementById('reportesTable');
    if (!table) return;

    const headers = Array.from(table.querySelectorAll('th'));
    let isResizing = false;
    let currentColIndex = -1;
    let startX = 0;
    let startWidth = 0;

    const MIN_WIDTH = 40;
    const MAX_WIDTH = 800;

    // Aplicar anchos guardados al inicio
    applySavedWidths();

    headers.forEach((header, index) => {
        // Crear el handle visual si no existe
        let handle = header.querySelector('.resize-handle');
        if (!handle) {
            handle = document.createElement('div');
            handle.className = 'resize-handle';
            header.appendChild(handle);
        }

        handle.addEventListener('mousedown', (e) => {
            e.preventDefault();
            e.stopPropagation();

            isResizing = true;
            currentColIndex = index;
            startX = e.clientX;
            startWidth = header.offsetWidth;

            handle.classList.add('active');
            document.body.style.cursor = 'col-resize';
            document.body.style.userSelect = 'none';
        });
    });

    document.addEventListener('mousemove', (e) => {
        if (!isResizing || currentColIndex === -1) return;

        const delta = e.clientX - startX;
        let newWidth = startWidth + delta;
        newWidth = Math.max(MIN_WIDTH, Math.min(newWidth, MAX_WIDTH));

        const header = headers[currentColIndex];
        header.style.width = `${newWidth}px`;
        header.style.minWidth = `${newWidth}px`;
        header.style.maxWidth = `${newWidth}px`;

        // Aplicar a todas las celdas de la columna
        table.querySelectorAll(`tbody td:nth-child(${currentColIndex + 1})`).forEach(cell => {
            cell.style.width = `${newWidth}px`;
            cell.style.minWidth = `${newWidth}px`;
            cell.style.maxWidth = `${newWidth}px`;
        });
    });

    document.addEventListener('mouseup', () => {
        if (isResizing) {
            isResizing = false;
            currentColIndex = -1;
            document.body.style.cursor = '';
            document.body.style.userSelect = '';

            // Quitar clase active de todos los handles
            table.querySelectorAll('.resize-handle.active').forEach(h => h.classList.remove('active'));

            // Guardar anchos
            saveColumnWidths();
        }
    });

    // Aplicar anchos cuando se renderiza nueva página o datos
    const originalRenderTable = window.renderTable || renderTable;
    window.renderTable = function (...args) {
        originalRenderTable.apply(this, args);
        setTimeout(applySavedWidths, 50); // Pequeño delay para que la tabla esté renderizada
    };
}

function applySavedWidths() {
    const saved = localStorage.getItem('reportes-column-widths');
    if (!saved) return;

    try {
        const widths = JSON.parse(saved);
        const table = document.getElementById('reportesTable');
        if (!table) return;

        const headers = table.querySelectorAll('th');
        headers.forEach((header, i) => {
            if (widths[i]) {
                const w = widths[i];
                header.style.width = `${w}px`;
                header.style.minWidth = `${w}px`;
                header.style.maxWidth = `${w}px`;

                table.querySelectorAll(`tbody td:nth-child(${i + 1})`).forEach(cell => {
                    cell.style.width = `${w}px`;
                    cell.style.minWidth = `${w}px`;
                    cell.style.maxWidth = `${w}px`;
                });
            }
        });
    } catch (e) {
        console.warn('Error aplicando anchos guardados en reportes:', e);
    }
}

function saveColumnWidths() {
    const table = document.getElementById('reportesTable');
    if (!table) return;

    const headers = table.querySelectorAll('th');
    const widths = Array.from(headers).map(th => {
        const w = th.style.width || th.offsetWidth;
        return parseInt(w) || 100;
    });

    localStorage.setItem('reportes-column-widths', JSON.stringify(widths));
}

// Inicializar al cargar
document.addEventListener('DOMContentLoaded', () => {
    setTimeout(initColumnResizingReportes, 200);
});

// También exportar si usas módulos
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { initColumnResizingReportes };
}