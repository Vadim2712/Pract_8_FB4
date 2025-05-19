const VAPID_PRIVATE_KEY = 'Ваш_приватный_ключ';
const VAPID_EMAIL = 'your@email.com';
const PORT = '3001';

// Глобальные переменные
let vapidPublicKey = '';
let tasks = [];
let currentFilter = 'all';
let serviceWorkerReg = null;

document.addEventListener('DOMContentLoaded', init);

async function init() {
  try {
    // Загрузка задач из хранилища
    loadTasks();
    renderTasks();

    // Получаем публичный ключ с сервера
    const response = await fetch('/vapid-public-key');
    const data = await response.json();
    vapidPublicKey = data.key;

    // Регистрация Service Worker
    if ('serviceWorker' in navigator) {
      serviceWorkerReg = await navigator.serviceWorker.register('/sw.js');
      console.log('Service Worker зарегистрирован');

      const subscription = await serviceWorkerReg.pushManager.getSubscription();
      updateUI(subscription);
    } else {
      console.log('Service Worker не поддерживается в этом браузере');
      updateStatus('Service Worker не поддерживается', 'orange');
    }

    setupEventHandlers();
  } catch (error) {
    console.error('Ошибка инициализации:', error);
    updateStatus(`Ошибка: ${error.message}`, 'red');
  }
}

function setupEventHandlers() {
  // Управление уведомлениями
  document.getElementById('subscribeBtn').addEventListener('click', togglePushNotification);
  document.getElementById('sendBtn').addEventListener('click', sendTestNotification);

  // Управление задачами
  document.getElementById('addTaskBtn').addEventListener('click', addTask);
  document.getElementById('taskInput').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') addTask();
  });

  // Фильтры задач
  document.getElementById('allBtn').addEventListener('click', () => applyFilter('all'));
  document.getElementById('activeBtn').addEventListener('click', () => applyFilter('active'));
  document.getElementById('completedBtn').addEventListener('click', () => applyFilter('completed'));
}

async function togglePushNotification() {
  if (!serviceWorkerReg) return;

  try {
    const subscription = await serviceWorkerReg.pushManager.getSubscription();

    if (subscription) {
      await unsubscribe(subscription);
      updateUI(null);
    } else {
      const newSub = await subscribe(serviceWorkerReg);
      updateUI(newSub);
    }
  } catch (error) {
    console.error('Ошибка:', error);
    updateStatus(`Ошибка: ${error.message}`, 'red');
  }
}

async function subscribe(reg) {
  const subscription = await reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(vapidPublicKey)
  });

  await fetch('/subscribe', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(subscription)
  });

  return subscription;
}

async function unsubscribe(subscription) {
  await subscription.unsubscribe();
  await fetch('/unsubscribe', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ endpoint: subscription.endpoint })
  });
}

// Функции для работы с задачами
function addTask() {
  const input = document.getElementById('taskInput');
  const text = input.value.trim();

  if (text) {
    const newTask = {
      id: Date.now(),
      text,
      completed: false,
      createdAt: new Date().toISOString()
    };

    tasks.push(newTask);
    saveTasks();
    renderTasks();
    input.value = '';

    // Отправить уведомление о новой задаче
    notifyNewTask(newTask);
  }
}

function toggleTaskStatus(id) {
  const task = tasks.find(t => t.id === id);
  if (task) {
    task.completed = !task.completed;
    saveTasks();
    renderTasks();
  }
}

function deleteTask(id) {
  tasks = tasks.filter(t => t.id !== id);
  saveTasks();
  renderTasks();
}

function applyFilter(filter) {
  currentFilter = filter;
  document.querySelectorAll('.filters button').forEach(btn => {
    btn.classList.remove('active');
  });
  document.getElementById(`${filter}Btn`).classList.add('active');
  renderTasks();
}

function renderTasks() {
  const taskList = document.getElementById('taskList');
  taskList.innerHTML = '';

  const filteredTasks = tasks.filter(task => {
    if (currentFilter === 'all') return true;
    if (currentFilter === 'active') return !task.completed;
    if (currentFilter === 'completed') return task.completed;
    return true;
  });

  if (filteredTasks.length === 0) {
    taskList.innerHTML = '<p>Нет задач для отображения</p>';
    return;
  }

  filteredTasks.forEach(task => {
    const taskItem = document.createElement('div');
    taskItem.className = `task-item ${task.completed ? 'completed' : ''}`;

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = task.completed;
    checkbox.addEventListener('change', () => toggleTaskStatus(task.id));

    const taskText = document.createElement('span');
    taskText.className = 'task-text';
    taskText.textContent = task.text;

    const deleteButton = document.createElement('button');
    deleteButton.className = 'delete-btn';
    deleteButton.textContent = '✖';
    deleteButton.addEventListener('click', () => deleteTask(task.id));

    taskItem.appendChild(checkbox);
    taskItem.appendChild(taskText);
    taskItem.appendChild(deleteButton);

    taskList.appendChild(taskItem);
  });
}

// Функции хранения задач
function saveTasks() {
  localStorage.setItem('tasks', JSON.stringify(tasks));
}

function loadTasks() {
  const savedTasks = localStorage.getItem('tasks');
  tasks = savedTasks ? JSON.parse(savedTasks) : [];
}

// Уведомления
async function notifyNewTask(task) {
  try {
    const response = await fetch('/send-notification', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: 'Новая задача добавлена',
        body: task.text
      })
    });

    if (!response.ok) throw new Error('Ошибка сервера');
  } catch (error) {
    console.error('Ошибка отправки уведомления:', error);
  }
}

async function sendTestNotification() {
  const title = document.getElementById('titleInput').value;
  const body = document.getElementById('bodyInput').value;

  try {
    const response = await fetch('/send-notification', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, body })
    });

    if (!response.ok) throw new Error('Ошибка сервера');
    updateStatus('Уведомление отправлено!', 'green');
  } catch (error) {
    console.error('Ошибка отправки:', error);
    updateStatus(`Ошибка: ${error.message}`, 'red');
  }
}

function updateUI(subscription) {
  const btn = document.getElementById('subscribeBtn');
  if (subscription) {
    btn.textContent = 'Отписаться от уведомлений';
    updateStatus('Подписка активна', 'green');
  } else {
    btn.textContent = 'Включить уведомления';
    updateStatus('Не подписано', 'gray');
  }
}

function updateStatus(text, color) {
  const el = document.getElementById('status');
  el.textContent = `Статус: ${text}`;
  el.style.color = color;
}

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}
