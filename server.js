require('dotenv').config();
const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { PrismaClient } = require('@prisma/client');
const cookieParser = require('cookie-parser');

const app = express();
const PORT = 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';
const prisma = new PrismaClient();

// --- Middleware ---
app.use(cors({
    origin: true, // Pozwala na wszystkie originy (w produkcji ustaw konkretny)
    credentials: true
}));
app.use(express.json());
app.use(cookieParser());

// Logowanie requestów
app.use((req, res, next) => {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] ${req.method} ${req.originalUrl}`);
    next();
});

// --- Middleware JWT ---
const authenticateToken = async (req, res, next) => {
    try {
        // Sprawdź token w ciasteczku
        const token = req.cookies.token || req.headers.authorization?.split(' ')[1];
        
        if (!token) {
            return res.status(401).json({ error: 'Brak tokenu autentykacji' });
        }

        const decoded = jwt.verify(token, JWT_SECRET);
        req.userId = decoded.userId;
        req.userEmail = decoded.email;
        next();
    } catch (error) {
        return res.status(401).json({ error: 'Nieprawidłowy lub wygasły token' });
    }
};

// --- Funkcje pomocnicze (WALIDACJA) ---

const ALLOWED_FIELDS = ['title', 'description', 'completed', 'assignee', 'priority', 'category', 'deadline'];
const ALLOWED_PRIORITIES = ['low', 'medium', 'high'];

/**
 * Ścisła walidacja daty DD.MM.YYYY
 */
const isValidDate = (dateString) => {
    if (!dateString || typeof dateString !== 'string') return false;

    // 1. Sprawdzenie formatu (musi być DD.MM.YYYY)
    const regex = /^\d{2}\.\d{2}\.\d{4}$/;
    if (!regex.test(dateString)) return false;

    // 2. Sprawdzenie kalendarzowe
    const parts = dateString.split('.');
    const day = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10);
    const year = parseInt(parts[2], 10);

    if (year < 1000 || year > 3000 || month === 0 || month > 12) return false;

    const monthLength = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    if (year % 400 === 0 || (year % 100 !== 0 && year % 4 === 0)) {
        monthLength[1] = 29;
    }

    return day > 0 && day <= monthLength[month - 1];
};

/**
 * Walidacja Requestu
 */
const validateRequest = (body, isUpdate = false) => {
    const errors = [];
    const keys = Object.keys(body);

    // Sprawdzenie niedozwolonych pól
    const unknownFields = keys.filter(key => !ALLOWED_FIELDS.includes(key));
    if (unknownFields.length > 0) {
        return `Niedozwolone pola w JSON: ${unknownFields.join(', ')}`;
    }

    // Walidacja tytułu
    if (!isUpdate && (!body.title || body.title.trim() === '')) {
        errors.push("Pole 'title' jest wymagane.");
    }
    if (body.title && typeof body.title !== 'string') {
        errors.push("Pole 'title' musi być tekstem.");
    }

    // Walidacja priorytetu
    if (body.priority && !ALLOWED_PRIORITIES.includes(body.priority)) {
        errors.push(`Pole 'priority' musi mieć wartość: ${ALLOWED_PRIORITIES.join(', ')}`);
    }

    // --- WALIDACJA: ASSIGNEE (ZMIANA LIMITU NA 20) ---
    if (body.assignee) {
        if (body.assignee.length > 20) {
            errors.push("Pole 'assignee' może mieć maksymalnie 20 znaków.");
        }
        // Zakaz cyfr
        if (/\d/.test(body.assignee)) {
            errors.push("Pole 'assignee' nie może zawierać cyfr.");
        }
    }

    // --- WALIDACJA: CATEGORY (ZMIANA LIMITU NA 20) ---
    if (body.category) {
        if (body.category.length > 20) {
            errors.push("Pole 'category' może mieć maksymalnie 20 znaków.");
        }
    }

    // --- WALIDACJA: DEADLINE ---
    if (body.deadline) {
        if (!isValidDate(body.deadline)) {
            if (/[a-zA-Z]/.test(body.deadline)) {
                errors.push("Pole 'deadline' nie może zawierać liter.");
            } else {
                errors.push("Błędna data (wymagany format DD.MM.YYYY).");
            }
        }
    }

    // --- WALIDACJA: COMPLETED ---
    if (body.completed !== undefined && typeof body.completed !== 'boolean') {
        errors.push("Pole 'completed' musi być wartością logiczną (true lub false).");
    }

    return errors.length > 0 ? errors : null;
};

// --- Endpointy Autentykacji ---

app.post('/register', async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({ error: 'Email i hasło są wymagane' });
        }

        if (password.length < 6) {
            return res.status(400).json({ error: 'Hasło musi mieć co najmniej 6 znaków' });
        }

        // Sprawdź, czy użytkownik już istnieje
        const existingUser = await prisma.user.findUnique({
            where: { email }
        });

        if (existingUser) {
            return res.status(400).json({ error: 'Użytkownik o tym adresie email już istnieje' });
        }

        // Haszuj hasło
        const passwordHash = await bcrypt.hash(password, 10);

        // Utwórz użytkownika
        const user = await prisma.user.create({
            data: {
                email,
                passwordHash
            }
        });

        // Generuj token JWT
        const token = jwt.sign(
            { userId: user.id, email: user.email },
            JWT_SECRET,
            { expiresIn: '7d' }
        );

        // Ustaw token w ciasteczku HttpOnly
        res.cookie('token', token, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'lax',
            maxAge: 7 * 24 * 60 * 60 * 1000 // 7 dni
        });

        res.status(201).json({
            message: 'Rejestracja zakończona pomyślnie',
            user: { id: user.id, email: user.email }
        });
    } catch (error) {
        console.error('Błąd rejestracji:', error);
        res.status(500).json({ error: 'Błąd serwera podczas rejestracji' });
    }
});

app.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({ error: 'Email i hasło są wymagane' });
        }

        // Znajdź użytkownika
        const user = await prisma.user.findUnique({
            where: { email }
        });

        if (!user) {
            return res.status(401).json({ error: 'Nieprawidłowy email lub hasło' });
        }

        // Weryfikuj hasło
        const isValidPassword = await bcrypt.compare(password, user.passwordHash);

        if (!isValidPassword) {
            return res.status(401).json({ error: 'Nieprawidłowy email lub hasło' });
        }

        // Generuj token JWT
        const token = jwt.sign(
            { userId: user.id, email: user.email },
            JWT_SECRET,
            { expiresIn: '7d' }
        );

        // Ustaw token w ciasteczku HttpOnly
        res.cookie('token', token, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'lax',
            maxAge: 7 * 24 * 60 * 60 * 1000 // 7 dni
        });

        res.json({
            message: 'Logowanie zakończone pomyślnie',
            user: { id: user.id, email: user.email }
        });
    } catch (error) {
        console.error('Błąd logowania:', error);
        res.status(500).json({ error: 'Błąd serwera podczas logowania' });
    }
});

app.post('/logout', (req, res) => {
    res.clearCookie('token');
    res.json({ message: 'Wylogowano pomyślnie' });
});

app.get('/me', authenticateToken, async (req, res) => {
    try {
        const user = await prisma.user.findUnique({
            where: { id: req.userId },
            select: { id: true, email: true, createdAt: true }
        });

        if (!user) {
            return res.status(404).json({ error: 'Użytkownik nie znaleziony' });
        }

        res.json(user);
    } catch (error) {
        console.error('Błąd pobierania danych użytkownika:', error);
        res.status(500).json({ error: 'Błąd serwera' });
    }
});

// --- Endpointy To-Do (Chronione) ---

app.get('/health', (req, res) => {
    res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

app.get('/tasks', authenticateToken, async (req, res) => {
    try {
        const tasks = await prisma.todo.findMany({
            where: { userId: req.userId },
            orderBy: { id: 'desc' }
        });

        // Mapowanie do formatu zgodnego z frontendem
        const formattedTasks = tasks.map(task => ({
            id: task.id,
            title: task.title,
            description: task.description || '',
            assignee: task.assignee || '',
            priority: task.priority,
            category: task.category || '',
            deadline: task.deadline || '',
            completed: task.completed,
            createdAt: task.createdAt.toISOString(),
            updatedAt: task.updatedAt.toISOString()
        }));

        res.json(formattedTasks);
    } catch (error) {
        console.error('Błąd pobierania zadań:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

app.post('/tasks', authenticateToken, async (req, res) => {
    try {
        const validationError = validateRequest(req.body, false);
        if (validationError) {
            return res.status(400).json({ error: 'Błąd walidacji danych', details: validationError });
        }

        const { title, description, assignee, priority, category, deadline } = req.body;

        const newTask = await prisma.todo.create({
            data: {
                title: title.trim(),
                description: description || '',
                assignee: assignee || '',
                priority: priority || 'medium',
                category: category || '',
                deadline: deadline || '',
                completed: false,
                userId: req.userId
            }
        });

        res.status(201).json({
            id: newTask.id,
            title: newTask.title,
            description: newTask.description || '',
            assignee: newTask.assignee || '',
            priority: newTask.priority,
            category: newTask.category || '',
            deadline: newTask.deadline || '',
            completed: newTask.completed,
            createdAt: newTask.createdAt.toISOString()
        });
    } catch (error) {
        console.error('Błąd dodawania zadania:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

app.put('/tasks/:id', authenticateToken, async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        if (isNaN(id)) return res.status(400).json({ error: 'Invalid ID format' });

        const validationError = validateRequest(req.body, true);
        if (validationError) {
            return res.status(400).json({ error: 'Błąd walidacji danych', details: validationError });
        }

        // Sprawdź, czy zadanie istnieje i należy do użytkownika
        const existingTask = await prisma.todo.findFirst({
            where: {
                id: id,
                userId: req.userId
            }
        });

        if (!existingTask) {
            return res.status(404).json({ error: 'Task not found', id });
        }

        const { title, description, completed, assignee, priority, category, deadline } = req.body;

        const updateData = {};
        if (title !== undefined) updateData.title = title;
        if (description !== undefined) updateData.description = description;
        if (completed !== undefined) updateData.completed = completed;
        if (assignee !== undefined) updateData.assignee = assignee;
        if (priority !== undefined) updateData.priority = priority;
        if (category !== undefined) updateData.category = category;
        if (deadline !== undefined) updateData.deadline = deadline;

        const updatedTask = await prisma.todo.update({
            where: { id: id },
            data: updateData
        });

        res.json({
            id: updatedTask.id,
            title: updatedTask.title,
            description: updatedTask.description || '',
            assignee: updatedTask.assignee || '',
            priority: updatedTask.priority,
            category: updatedTask.category || '',
            deadline: updatedTask.deadline || '',
            completed: updatedTask.completed,
            createdAt: updatedTask.createdAt.toISOString(),
            updatedAt: updatedTask.updatedAt.toISOString()
        });
    } catch (error) {
        console.error('Błąd edycji zadania:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

app.delete('/tasks/:id', authenticateToken, async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        if (isNaN(id)) return res.status(400).json({ error: 'Invalid ID format' });

        // Sprawdź, czy zadanie istnieje i należy do użytkownika
        const existingTask = await prisma.todo.findFirst({
            where: {
                id: id,
                userId: req.userId
            }
        });

        if (!existingTask) {
            return res.status(404).json({ error: 'Task not found', id });
        }

        await prisma.todo.delete({
            where: { id: id }
        });

        res.json({ message: 'Task deleted successfully', id });
    } catch (error) {
        console.error('Błąd usuwania zadania:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

app.use((req, res) => {
    res.status(404).json({
        error: 'Endpoint not found',
        message: `Adres URL '${req.originalUrl}' nie istnieje.`
    });
});

// Graceful shutdown
process.on('beforeExit', async () => {
    await prisma.$disconnect();
});

app.listen(PORT, () => {
    console.log(`Serwer działa na porcie ${PORT}`);
});
