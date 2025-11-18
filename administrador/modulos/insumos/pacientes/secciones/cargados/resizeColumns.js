// resizeColumnsCargados.js
function initColumnResizing() {
    const table = document.querySelector('.cargados-table');
    if (!table) return;

    const headers = Array.from(table.querySelectorAll('th'));
    const resizeHandles = table.querySelectorAll('.resize-handle');

    let isResizing = false;
    let currentColIndex = -1;
    let startX = 0;
    let startWidth = 0;

    const MIN_WIDTH = 30;
    const MAX_WIDTH = 600;

    function updateTableWidth() {
        let totalWidth = 0;
        headers.forEach(h => totalWidth += parseInt(h.style.width) || h.offsetWidth);
        table.style.width = `${totalWidth}px`;
        table.style.minWidth = `${totalWidth}px`;
    }

    function updateColumnCells(colIndex, width) {
        const header = headers[colIndex];
        header.style.width = header.style.minWidth = header.style.maxWidth = `${width}px`;
        const rows = table.querySelectorAll('tbody tr');
        rows.forEach(row => {
            const cell = row.cells[colIndex];
            if (cell) cell.style.width = cell.style.minWidth = cell.style.maxWidth = `${width}px`;
        });
    }

    headers.forEach((header, i) => {
        const w = header.offsetWidth;
        updateColumnCells(i, w);
    });
    updateTableWidth();

    resizeHandles.forEach((handle, i) => {
        handle.addEventListener('mousedown', e => {
            e.preventDefault(); e.stopPropagation();
            isResizing = true;
            currentColIndex = i;
            startX = e.clientX;
            startWidth = headers[i].offsetWidth;
            handle.classList.add('active');
            document.body.style.cursor = 'col-resize';
            document.body.style.userSelect = 'none';
        });
    });

    document.addEventListener('mousemove', e => {
        if (!isResizing) return;
        let newWidth = startWidth + (e.clientX - startX);
        newWidth = Math.max(MIN_WIDTH, Math.min(newWidth, MAX_WIDTH));
        updateColumnCells(currentColIndex, newWidth);
        updateTableWidth();
    });

    document.addEventListener('mouseup', () => {
        if (isResizing) {
            isResizing = false;
            document.querySelectorAll('.resize-handle.active').forEach(h => h.classList.remove('active'));
            document.body.style.cursor = '';
            document.body.style.userSelect = '';
            saveColumnWidths();
        }
    });

    function saveColumnWidths() {
        const widths = headers.map(h => parseInt(h.style.width) || h.offsetWidth);
        localStorage.setItem('cargados-column-widths', JSON.stringify(widths));
    }

    const saved = localStorage.getItem('cargados-column-widths');
    if (saved) {
        try {
            const widths = JSON.parse(saved);
            headers.forEach((h, i) => widths[i] && updateColumnCells(i, widths[i]));
        } catch(e) {}
    }
}

document.addEventListener('DOMContentLoaded', () => {
    setTimeout(initColumnResizing, 100);
});