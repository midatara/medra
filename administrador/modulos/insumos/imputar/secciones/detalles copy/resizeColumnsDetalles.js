function initColumnResizing() {
    const table = document.querySelector('.detalles-table');
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
        let total = 0;
        headers.forEach(h => total += parseInt(h.style.width) || h.offsetWidth);
        table.style.width = total + 'px';
        table.style.minWidth = total + 'px';
    }

    function updateColumnCells(colIndex, width) {
        const header = headers[colIndex];
        header.style.width = width + 'px';
        header.style.minWidth = width + 'px';
        header.style.maxWidth = width + 'px';

        const rows = table.querySelectorAll('tbody tr');
        rows.forEach(row => {
            const cell = row.cells[colIndex];
            if (cell) {
                cell.style.width = width + 'px';
                cell.style.minWidth = width + 'px';
                cell.style.maxWidth = width + 'px';
            }
        });
    }

    const saved = localStorage.getItem('detalles-column-widths');
    if (saved) {
        try {
            const widths = JSON.parse(saved);
            headers.forEach((th, i) => widths[i] && updateColumnCells(i, widths[i]));
        } catch (e) { console.error(e); }
    }
    updateTableWidth();

    resizeHandles.forEach((handle, i) => {
        handle.addEventListener('mousedown', e => {
            e.preventDefault(); e.stopPropagation();
            isResizing = true;
            currentColIndex = i;
            startX = e.clientX;
            startWidth = parseInt(headers[i].style.width) || headers[i].offsetWidth;
            handle.classList.add('active');
            document.body.style.cursor = 'col-resize';
            document.body.style.userSelect = 'none';
        });
    });

    document.addEventListener('mousemove', e => {
        if (!isResizing || currentColIndex === -1) return;
        let newWidth = startWidth + (e.clientX - startX);
        newWidth = Math.max(MIN_WIDTH, Math.min(newWidth, MAX_WIDTH));
        updateColumnCells(currentColIndex, newWidth);
        updateTableWidth();
    });

    document.addEventListener('mouseup', () => {
        if (isResizing) {
            isResizing = false;
            currentColIndex = -1;
            document.body.style.cursor = '';
            document.body.style.userSelect = '';
            document.querySelectorAll('.resize-handle.active').forEach(h => h.classList.remove('active'));
            localStorage.setItem('detalles-column-widths', JSON.stringify(headers.map(th => parseInt(th.style.width) || th.offsetWidth)));
        }
    });

    new MutationObserver(() => {
        headers.forEach((th, i) => {
            const w = parseInt(th.style.width) || th.offsetWidth;
            table.querySelectorAll(`tbody tr td:nth-child(${i+1})`).forEach(td => {
                td.style.width = w + 'px';
                td.style.minWidth = w + 'px';
                td.style.maxWidth = w + 'px';
            });
        });
        updateTableWidth();
    }).observe(table.querySelector('tbody'), { childList: true });
}

document.addEventListener('DOMContentLoaded', () => setTimeout(initColumnResizing, 150));