// --- Zmienne globalne ---
let tasks = []; // Lokalna kopia zadań pobranych z serwera
let currentFilter = 'all'; // Aktualny filtr ('all', 'active', 'completed')
const API_URL = 'http://localhost:3000'; // Adres Twojego API
let currentUser = null;

// --- Selektory DOM ---
const authScreen = document.getElementById('auth-screen');
const mainContent = document.getElementById('main-content');
const taskList = document.getElementById('task-list');
const loader = document.getElementById('loader');
const emptyState = document.getElementById('empty-state');
const taskCounter = document.getElementById('task-counter');
const userInfo = document.getElementById('user-info');
const userEmail = document.getElementById('user-email');
const logoutBtnContainer = document.getElementById('logout-btn-container');
const logoutBtn = document.getElementById('logout-btn');

// Formularze autentykacji
const loginForm = document.getElementById('login-form');
const registerForm = document.getElementById('register-form');
const loginEmailInput = document.getElementById('login-email');
const loginPasswordInput = document.getElementById('login-password');
const registerEmailInput = document.getElementById('register-email');
const registerPasswordInput = document.getElementById('register-password');

// Formularz dodawania
const addTaskForm = document.getElementById('add-task-form');
const titleInput = document.getElementById('title');
const descriptionInput = document.getElementById('description');
const assigneeInput = document.getElementById('assignee');
const priorityInput = document.getElementById('priority');
const categoryInput = document.getElementById('category');
const deadlineInput = document.getElementById('deadline'); 
let addTaskModal; 

// Formularz edycji
const editTaskForm = document.getElementById('edit-task-form');
const editTaskIdInput = document.getElementById('edit-task-id');
const editTitleInput = document.getElementById('edit-title');
const editDescriptionInput = document.getElementById('edit-description');
const editAssigneeInput = document.getElementById('edit-assignee');
const editPriorityInput = document.getElementById('edit-priority');
const editCategoryInput = document.getElementById('edit-category');
const editDeadlineInput = document.getElementById('edit-deadline');
let editTaskModal;

// Modal usuwania
let deleteConfirmModal;
let logoutConfirmModal;
const confirmDeleteBtn = document.getElementById('confirm-delete-btn');
const confirmLogoutBtn = document.getElementById('confirm-logout-btn');

// Filtry
const filterButtonsContainer = document.getElementById('filter-buttons');

// --- Funkcje pomocnicze API ---

/**
 * Wykonuje zapytanie fetch z obsługą ciasteczek
 */
async function apiFetch(url, options = {}) {
    const defaultOptions = {
        credentials: 'include',
        headers: {
            'Content-Type': 'application/json',
            ...options.headers
        }
    };

    const response = await fetch(`${API_URL}${url}`, { ...defaultOptions, ...options });
    
    if (response.status === 401) {
        // Token wygasł lub nieprawidłowy
        handleLogout();
        throw new Error('Sesja wygasła. Zaloguj się ponownie.');
    }
    
    return response;
}

// --- Inicjalizacja Aplikacji ---
document.addEventListener('DOMContentLoaded', async () => {
    // Inicjalizacja Materialize tabs
    M.Tabs.init(document.querySelectorAll('.tabs'));
    
    const datepickerOptions = {
        format: 'dd.mm.yyyy',
        autoClose: true,
        i18n: {
            cancel: 'Anuluj',
            clear: 'Wyczyść',
            done: 'OK',
            months: ['Styczeń', 'Luty', 'Marzec', 'Kwiecień', 'Maj', 'Czerwiec', 'Lipiec', 'Sierpień', 'Wrzesień', 'Październik', 'Listopad', 'Grudzień'],
            monthsShort: ['Sty', 'Lut', 'Mar', 'Kwi', 'Maj', 'Cze', 'Lip', 'Sie', 'Wrz', 'Paź', 'Lis', 'Gru'],
            weekdays: ['Niedziela', 'Poniedziałek', 'Wtorek', 'Środa', 'Czwartek', 'Piątek', 'Sobota'],
            weekdaysShort: ['Nd', 'Pn', 'Wt', 'Śr', 'Cz', 'Pt', 'So'],
            weekdaysAbbrev: ['N', 'P', 'W', 'Ś', 'C', 'P', 'S']
        }
    };

    // Inicjalizacja instancji modali
    addTaskModal = M.Modal.init(document.getElementById('add-task-modal'), {
        onOpenStart: () => {
            M.FormSelect.init(document.getElementById('priority'), {});
            M.Datepicker.init(document.getElementById('deadline'), datepickerOptions);
            M.updateTextFields();
        }
    });
    
    editTaskModal = M.Modal.init(document.getElementById('edit-task-modal'), {
        onOpenStart: () => {
            M.FormSelect.init(document.getElementById('edit-priority'), {});
            M.Datepicker.init(document.getElementById('edit-deadline'), datepickerOptions);
            M.updateTextFields();
        }
    });
    
    deleteConfirmModal = M.Modal.init(document.getElementById('delete-confirm-modal'));
    logoutConfirmModal = M.Modal.init(document.getElementById('logout-confirm-modal'));

    M.FormSelect.init(document.querySelectorAll('select'));
    M.Datepicker.init(document.querySelectorAll('.datepicker'), datepickerOptions);

    setupEventListeners();
    
    // Sprawdź, czy użytkownik jest zalogowany
    await checkAuth();
});

function setupEventListeners() {
    // Autentykacja
    loginForm.addEventListener('submit', handleLogin);
    registerForm.addEventListener('submit', handleRegister);
    logoutBtn.addEventListener('click', () => logoutConfirmModal.open());
    confirmLogoutBtn.addEventListener('click', handleLogout);
    
    // Zadania
    addTaskForm.addEventListener('submit', handleAddTask);
    editTaskForm.addEventListener('submit', handleEditTask);
    taskList.addEventListener('click', handleTaskListClick);
    confirmDeleteBtn.addEventListener('click', handleConfirmDelete);
    filterButtonsContainer.addEventListener('click', handleFilterClick);
}

// --- Autentykacja ---

/**
 * Sprawdza, czy użytkownik jest zalogowany
 */
async function checkAuth() {
    try {
        const response = await apiFetch('/me');
        if (response.ok) {
            currentUser = await response.json();
            showMainContent();
        } else {
            showAuthScreen();
        }
    } catch (error) {
        console.error('Błąd sprawdzania autentykacji:', error);
        showAuthScreen();
    }
}

/**
 * Obsługuje logowanie
 */
async function handleLogin(e) {
    e.preventDefault();
    const email = loginEmailInput.value.trim();
    const password = loginPasswordInput.value;

    if (!email || !password) {
        M.toast({ html: 'Wypełnij wszystkie pola!' });
        return;
    }

    try {
        showLoader(true);
        const response = await apiFetch('/login', {
            method: 'POST',
            body: JSON.stringify({ email, password })
        });

        if (response.ok) {
            const data = await response.json();
            currentUser = data.user;
            M.toast({ html: 'Zalogowano pomyślnie!' });
            showMainContent();
            await fetchTasks();
        } else {
            const error = await response.json();
            M.toast({ html: error.error || 'Błąd logowania' });
        }
    } catch (error) {
        console.error('Błąd logowania:', error);
        M.toast({ html: error.message || 'Błąd połączenia z serwerem' });
    } finally {
        showLoader(false);
    }
}

/**
 * Obsługuje rejestrację
 */
async function handleRegister(e) {
    e.preventDefault();
    const email = registerEmailInput.value.trim();
    const password = registerPasswordInput.value;

    if (!email || !password) {
        M.toast({ html: 'Wypełnij wszystkie pola!' });
        return;
    }

    if (password.length < 6) {
        M.toast({ html: 'Hasło musi mieć co najmniej 6 znaków!' });
        return;
    }

    try {
        showLoader(true);
        const response = await apiFetch('/register', {
            method: 'POST',
            body: JSON.stringify({ email, password })
        });

        if (response.ok) {
            const data = await response.json();
            currentUser = data.user;
            M.toast({ html: 'Rejestracja zakończona pomyślnie!' });
            showMainContent();
            await fetchTasks();
        } else {
            const error = await response.json();
            M.toast({ html: error.error || 'Błąd rejestracji' });
        }
    } catch (error) {
        console.error('Błąd rejestracji:', error);
        M.toast({ html: error.message || 'Błąd połączenia z serwerem' });
    } finally {
        showLoader(false);
    }
}

/**
 * Obsługuje wylogowanie
 */
async function handleLogout() {
    try {
        await apiFetch('/logout', {
            method: 'POST'
        });
        currentUser = null;
        logoutConfirmModal.close();
        showAuthScreen();
        M.toast({ html: 'Wylogowano pomyślnie' });
    } catch (error) {
        console.error('Błąd wylogowania:', error);
        // Nawet jeśli wystąpi błąd, wyczyść sesję lokalnie
        currentUser = null;
        showAuthScreen();
    }
}

/**
 * Pokazuje ekran autentykacji
 */
function showAuthScreen() {
    authScreen.classList.remove('hide');
    mainContent.classList.add('hide');
    userInfo.classList.add('hide');
    logoutBtnContainer.classList.add('hide');
    loginForm.reset();
    registerForm.reset();
}

/**
 * Pokazuje główną zawartość aplikacji
 */
function showMainContent() {
    authScreen.classList.add('hide');
    mainContent.classList.remove('hide');
    userInfo.classList.remove('hide');
    logoutBtnContainer.classList.remove('hide');
    if (currentUser) {
        userEmail.textContent = currentUser.email;
    }
}

// --- Logika API (CRUD) ---

/**
 * Włącza/wyłącza loader.
 */
function showLoader(show) {
    if (show) {
        loader.classList.remove('hide');
        taskList.classList.add('hide');
        emptyState.classList.add('hide');
    } else {
        loader.classList.add('hide');
        taskList.classList.remove('hide');
    }
}

/**
 * Pobiera zadania z serwera (GET).
 */
async function fetchTasks() {
    try {
        showLoader(true);
        const response = await apiFetch('/tasks');
        
        if (!response.ok) throw new Error('Błąd pobierania danych z serwera');
        
        const backendTasks = await response.json();
        
        // Mapowanie danych: Backend (completed: boolean) -> Frontend (status: string)
        tasks = backendTasks.map(t => ({
            ...t,
            status: t.completed ? 'completed' : 'active',
            priority: t.priority || 'medium',
            assignee: t.assignee || '',
            category: t.category || '',
            deadline: t.deadline || ''
        }));

        // Sortujemy: ID malejąco (najnowsze na górze)
        tasks.sort((a, b) => b.id - a.id);

        renderTasks();
    } catch (error) {
        console.error("API Error:", error);
        M.toast({ html: error.message || 'Nie udało się połączyć z serwerem.' });
        tasks = [];
        renderTasks();
    } finally {
        showLoader(false);
    }
}

/**
 * Obsługuje dodawanie nowego zadania (POST).
 */
async function handleAddTask(e) {
    e.preventDefault();
    const title = titleInput.value.trim();
    if (!title) {
        M.toast({ html: 'Tytuł zadania jest wymagany!' });
        return;
    }

    const newTaskPayload = {
        title: title,
        description: descriptionInput.value.trim(),
        assignee: assigneeInput.value.trim(),
        priority: priorityInput.value,
        category: categoryInput.value.trim(),
        deadline: deadlineInput.value.trim()
    };
    
    try {
        showLoader(true);
        const response = await apiFetch('/tasks', {
            method: 'POST',
            body: JSON.stringify(newTaskPayload)
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Błąd zapisu zadania');
        }

        M.toast({ html: 'Zadanie dodane pomyślnie!' });
        addTaskForm.reset();
        M.FormSelect.init(priorityInput, {});
        addTaskModal.close();

        await fetchTasks();

    } catch (error) {
        console.error("Błąd podczas dodawania zadania:", error);
        M.toast({ html: error.message || `Błąd: ${error.message}` });
        showLoader(false);
    }
}

/**
 * Obsługuje zapisywanie edytowanego zadania (PUT).
 */
async function handleEditTask(e) {
    e.preventDefault();
    const id = editTaskIdInput.value;
    const title = editTitleInput.value.trim();

    if (!id || !title) {
        M.toast({ html: 'Wystąpił błąd.' });
        return;
    }

    const updatedPayload = {
        title: title,
        description: editDescriptionInput.value.trim(),
        assignee: editAssigneeInput.value.trim(),
        priority: editPriorityInput.value,
        category: editCategoryInput.value.trim(),
        deadline: editDeadlineInput.value.trim()
    };

    try {
        showLoader(true);
        const response = await apiFetch(`/tasks/${id}`, {
            method: 'PUT',
            body: JSON.stringify(updatedPayload)
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Błąd edycji');
        }

        M.toast({ html: 'Zadanie zaktualizowane!' });
        editTaskForm.reset();
        editTaskModal.close();
        
        await fetchTasks();

    } catch (error) {
        console.error("Błąd edycji:", error);
        M.toast({ html: error.message || `Błąd: ${error.message}` });
        showLoader(false);
    }
}

/**
 * Obsługuje kliknięcia na liście zadań.
 */
function handleTaskListClick(e) {
    const taskItem = e.target.closest('.task-item');
    if (!taskItem) return; 

    const taskId = taskItem.dataset.id;
    
    if (e.target.matches('input[type="checkbox"]')) {
        const isCompleted = e.target.checked;
        toggleTaskStatus(taskId, isCompleted);
    }
    
    if (e.target.closest('.edit-btn')) {
        openEditModal(taskId);
    }
    
    if (e.target.closest('.delete-btn')) {
        openDeleteConfirmModal(taskId);
    }
}

/**
 * Zmienia status zadania (PUT - partial update).
 */
async function toggleTaskStatus(id, isCompleted) {
    // Optymistyczna aktualizacja (UI zmienia się od razu)
    const task = tasks.find(t => t.id == id);
    if (task) {
        task.status = isCompleted ? 'completed' : 'active';
        renderTasks();
    }
    
    try {
        const response = await apiFetch(`/tasks/${id}`, {
            method: 'PUT',
            body: JSON.stringify({ completed: isCompleted })
        });

        if (!response.ok) throw new Error('Błąd zmiany statusu');
        
        M.toast({ html: `Status zadania zaktualizowany.` });

    } catch (error) {
        console.error("Błąd zmiany statusu:", error);
        M.toast({ html: `Błąd połączenia: Cofam zmianę` });
        fetchTasks();
    }
}

/**
 * Otwiera modal usuwania.
 */
function openDeleteConfirmModal(id) {
    confirmDeleteBtn.dataset.taskId = id;
    deleteConfirmModal.open();
}

/**
 * Obsługuje potwierdzenie usunięcia (DELETE).
 */
async function handleConfirmDelete() {
    const id = confirmDeleteBtn.dataset.taskId;
    if (!id) return;

    try {
        const response = await apiFetch(`/tasks/${id}`, {
            method: 'DELETE'
        });

        if (response.ok) {
            M.toast({ html: 'Zadanie usunięte.' });
        } else if (response.status === 404) {
            M.toast({ html: 'Zadanie już nie istnieje.' });
        } else {
            const error = await response.json();
            throw new Error(error.error || 'Nie udało się usunąć.');
        }

        deleteConfirmModal.close();
        await fetchTasks();

    } catch (error) {
        console.error("Błąd usuwania:", error);
        M.toast({ html: error.message || `Błąd: ${error.message}` });
    }
}

/**
 * Otwiera modal edycji.
 */
function openEditModal(id) {
    const task = tasks.find(t => t.id == id);
    if (!task) {
        M.toast({ html: 'Nie znaleziono zadania!' });
        return;
    }

    editTaskIdInput.value = task.id;
    editTitleInput.value = task.title;
    editDescriptionInput.value = task.description || '';
    editAssigneeInput.value = task.assignee || '';
    editPriorityInput.value = task.priority || 'medium';
    editCategoryInput.value = task.category || '';
    editDeadlineInput.value = task.deadline || ''; 
    
    M.updateTextFields();
    M.FormSelect.init(editPriorityInput, {}); 
    editTaskModal.open();
}

// --- Renderowanie i UI ---

function renderTasks() {
    taskList.innerHTML = ''; 

    const filteredTasks = tasks.filter(task => {
        if (currentFilter === 'all') return true;
        return task.status === currentFilter;
    });

    if (filteredTasks.length === 0) {
        if (tasks.length > 0) {
            emptyState.querySelector('h5').textContent = 'Brak zadań';
            emptyState.querySelector('p').textContent = `Nie masz żadnych ${currentFilter === 'active' ? 'aktywnych' : 'zakończonych'} zadań.`;
        } else {
            emptyState.querySelector('h5').textContent = 'Brak zadań';
            emptyState.querySelector('p').textContent = 'Nie masz obecnie żadnych zadań na serwerze.';
        }
        emptyState.classList.remove('hide');
    } else {
        emptyState.classList.add('hide');
        filteredTasks.forEach(task => {
            const taskElement = createTaskListItem(task);
            taskList.appendChild(taskElement);
        });
    }
    
    updateTaskCounter();
}

function createTaskListItem(task) {
    const li = document.createElement('li');
    li.className = 'collection-item task-item';
    li.dataset.id = task.id;

    if (task.status === 'completed') {
        li.classList.add('completed');
    }

    const priority = task.priority || 'medium';
    const priorityClass = getPriorityClass(priority);
    const priorityText = { low: 'Niski', medium: 'Średni', high: 'Wysoki' }[priority] || 'Średni';
    
    const overdue = isTaskOverdue(task);
    if (overdue) li.classList.add('overdue-task');

    li.innerHTML = `
        <div class="row" style="margin-bottom: 0;">
            <div class="col s12 m8 l9">
                <p style="margin-top: 10px;">
                    <label>
                        <input type="checkbox" ${task.status === 'completed' ? 'checked' : ''} />
                        <span class="task-title">${escapeHTML(task.title)}</span>
                    </label>
                </p>
                ${task.description ? `<p class="task-description">${escapeHTML(task.description)}</p>` : ''}
            </div>
            
            <div class="col s12 m4 l3 task-actions secondary-content" style="text-align: right; padding-top: 10px;">
                <a href="#!" class="btn-flat waves-effect waves-teal edit-btn" title="Edytuj">
                    <i class="material-icons blue-text text-darken-2">edit</i>
                </a>
                <a href="#!" class="btn-flat waves-effect waves-red delete-btn" title="Usuń">
                    <i class="material-icons red-text text-darken-2">delete_forever</i>
                </a>
            </div>
            
            <div class="col s12 task-details">
                <span class="priority-badge ${priorityClass}">${priorityText}</span>
                
                ${task.deadline ? `
                <span class="task-meta chip ${overdue ? 'red-text text-darken-2 overdue-chip' : ''}">
                    <i class="material-icons">date_range</i>
                    ${escapeHTML(task.deadline)}
                </span>` : ''}

                ${task.assignee ? `
                <span class="task-meta chip">
                    <i class="material-icons">person</i>
                    ${escapeHTML(task.assignee)}
                </span>` : ''}
                
                ${task.category ? `
                <span class="task-meta chip">
                    <i class="material-icons">label</i>
                    ${escapeHTML(task.category)}
                </span>` : ''}
                
            </div>
        </div>
    `;
    return li;
}

function updateTaskCounter() {
    const activeTasksCount = tasks.filter(task => task.status === 'active').length;
    taskCounter.textContent = `Aktywne zadania: ${activeTasksCount}`;
    taskCounter.classList.remove('hide');
}

function handleFilterClick(e) {
    e.preventDefault();
    const clickedButton = e.target.closest('a.btn, a.btn-flat'); 
    
    if (!clickedButton || !clickedButton.dataset.filter) return; 

    const filter = clickedButton.dataset.filter;
    if (filter === currentFilter) return; 

    currentFilter = filter;
    
    filterButtonsContainer.querySelectorAll('a').forEach(btn => {
        if (btn.dataset.filter === filter) {
            btn.classList.add('blue'); 
            btn.classList.remove('btn-flat');
        } else {
            btn.classList.remove('blue');
            btn.classList.add('btn-flat');
        }
    });

    renderTasks(); 
}

// --- Funkcje pomocnicze ---

function getPriorityClass(priority) {
    switch (priority) {
        case 'low': return 'low';
        case 'medium': return 'medium';
        case 'high': return 'high';
        default: return 'medium'; 
    }
}

function escapeHTML(str) {
    if (!str) return '';
    return str.replace(/[&<>"']/g, function(match) {
        return {
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#39;'
        }[match];
    });
}

function parseDate(dateString) {
    if (!dateString) return null;
    const parts = dateString.split('.');
    if (parts.length === 3) {
        return new Date(parts[2], parts[1] - 1, parts[0]);
    }
    return null;
}

function isTaskOverdue(task) {
    if (task.status === 'completed' || !task.deadline) {
        return false;
    }
    const deadlineDate = parseDate(task.deadline);
    if (!deadlineDate) return false;

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    return deadlineDate < todayStart;
}
