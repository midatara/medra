function initColumnResizing() {
    const table = document.querySelector('.imputados-table');
    if (!table) return;

    const headers = Array.from(table.querySelectorAll('th'));
    const resizeHandles = table.querySelectorAll('.resize-handle');

    let isResizing = false;
    let currentHeader = null;
    let currentHandle = null;
    let currentColIndex = -1;
    let startX = 0;
    let startWidth = 0;

    const MIN_WIDTH = 30;
    const MAX_WIDTH = 600;

    function updateTableWidth() {
        let totalWidth = 0;
        headers.forEach(header => {
            const width = parseInt(header.style.width) || header.offsetWidth;
            totalWidth += width;
        });
        table.style.width = `${totalWidth}px`;
        table.style.minWidth = `${totalWidth}px`;
    }

    function updateColumnCells(colIndex, width) {
        const header = headers[colIndex];
        header.style.width = `${width}px`;
        header.style.minWidth = `${width}px`;
        header.style.maxWidth = `${width}px`;

        const tbody = table.querySelector('tbody');
        if (tbody) {
            const rows = tbody.querySelectorAll('tr');
            rows.forEach(row => {
                const cell = row.cells[colIndex];
                if (cell) {
                    cell.style.width = `${width}px`;
                    cell.style.minWidth = `${width}px`;
                    cell.style.maxWidth = `${width}px`;
                }
            });
        }
    }

    // Cargar anchos guardados
    const saved = localStorage.getItem('imputados-column-widths');
    if (saved) {
        try {
            const widths = JSON.parse(saved);
            headers.forEach((th, i) => {
                if (widths[i]) {
                    updateColumnCells(i, widths[i]);
                }
            });
        } catch (e) {
            console.error('Error cargando anchos de imputados:', e);
        }
    } else {
        headers.forEach((header, i) => {
            const width = header.offsetWidth;
            updateColumnCells(i, width);
        });
    }
    updateTableWidth();

    resizeHandles.forEach((handle, index) => {
        handle.addEventListener('mousedown', (e) => {
            e.preventDefault();
            e.stopPropagation();
            isResizing = true;
            currentColIndex = index;
            currentHeader = headers[index];
            currentHandle = handle;
            startX = e.clientX;
            startWidth = parseInt(currentHeader.style.width) || currentHeader.offsetWidth;
            handle.classList.add('active');
            document.body.style.userSelect = 'none';
            document.body.style.cursor = 'col-resize';
        });
    });

    document.addEventListener('mousemove', (e) => {
        if (!isResizing || currentColIndex === -1) return;
        const deltaX = e.clientX - startX;
        let newWidth = startWidth + deltaX;
        newWidth = Math.max(MIN_WIDTH, Math.min(newWidth, MAX_WIDTH));
        updateColumnCells(currentColIndex, newWidth);
        updateTableWidth();
    });

    document.addEventListener('mouseup', () => {
        if (isResizing) {
            isResizing = false;
            if (currentHandle) currentHandle.classList.remove('active');
            currentHeader = null;
            currentHandle = null;
            currentColIndex = -1;
            document.body.style.userSelect = '';
            document.body.style.cursor = '';
            saveColumnWidths();
            updateTableWidth();
        }
    });

    // Observer para cuando se renderiza nueva data
    const tbody = table.querySelector('tbody');
    if (tbody) {
        const observer = new MutationObserver(() => {
            headers.forEach((header, index) => {
                const width = parseInt(header.style.width) || header.offsetWidth;
                const rows = tbody.querySelectorAll('tr');
                rows.forEach(row => {
                    const cell = row.cells[index];
                    if (cell) {
                        cell.style.width = `${width}px`;
                        cell.style.minWidth = `${width}px`;
                        cell.style.maxWidth = `${width}px`;
                    }
                });
            });
            updateTableWidth();
        });
        observer.observe(tbody, { childList: true, subtree: false });
    }
}

function saveColumnWidths() {
    const headers = document.querySelectorAll('.imputados-table th');
    const widths = Array.from(headers).map(th => parseInt(th.style.width) || th.offsetWidth);
    localStorage.setItem('imputados-column-widths', JSON.stringify(widths));
}

document.addEventListener('DOMContentLoaded', () => {
    setTimeout(() => {
        initColumnResizing();
    }, 150);
});