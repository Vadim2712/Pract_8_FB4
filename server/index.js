require('dotenv').config();
const express = require('express');
const webPush = require('web-push');
const path = require('path');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, '../client')));

webPush.setVapidDetails(
  `mailto:${process.env.VAPID_EMAIL}`,
  process.env.VAPID_PUBLIC_KEY,
  process.env.VAPID_PRIVATE_KEY
);

let subscriptions = [];

// Функция для отправки напоминаний о задачах
function scheduledReminders() {
  const payload = JSON.stringify({
    title: 'Напоминание о задачах',
    body: 'У вас есть невыполненные задачи',
    icon: '/icons/icon-192x192.png',
    url: '/'
  });

  if (subscriptions.length > 0) {
    console.log(`Отправка напоминаний для ${subscriptions.length} подписчиков`);
    
    subscriptions.forEach(subscription => {
      webPush.sendNotification(subscription, payload)
        .catch(err => {
          console.error('Ошибка отправки напоминания:', err);
          if (err.statusCode === 410) {
            // Удаляем недействительную подписку
            subscriptions = subscriptions.filter(s => s.endpoint !== subscription.endpoint);
          }
        });
    });
  }
}

// Запуск периодических напоминаний каждые 2 часа
setInterval(scheduledReminders, 2 * 60 * 60 * 1000);

app.post('/subscribe', (req, res) => {
  const subscription = req.body;
  if (!subscriptions.some(s => s.endpoint === subscription.endpoint)) {
    subscriptions.push(subscription);
    console.log('Новая подписка добавлена');
  }
  res.status(201).json({});
});

app.post('/unsubscribe', (req, res) => {
  const { endpoint } = req.body;
  subscriptions = subscriptions.filter(s => s.endpoint !== endpoint);
  console.log('Подписка удалена');
  res.status(200).json({});
});

app.post('/send-notification', (req, res) => {
  const { title, body } = req.body;
  const payload = JSON.stringify({
    title: title || 'Тестовое уведомление',
    body: body || 'Это тестовое сообщение',
    icon: '/icons/icon-192x192.png',
    url: '/'
  });

  const results = [];
  const promises = subscriptions.map(sub => 
    webPush.sendNotification(sub, payload)
      .then(() => results.push({ status: 'success', endpoint: sub.endpoint }))
      .catch(err => {
        console.error('Ошибка отправки:', err);
        results.push({ status: 'error', endpoint: sub.endpoint, error: err.message });
        
        // Автоматическое удаление недействительных подписок
        if (err.statusCode === 410) {
          subscriptions = subscriptions.filter(s => s.endpoint !== sub.endpoint);
        }
      })
  );

  Promise.all(promises)
    .then(() => res.json({ results }))
    .catch(err => res.status(500).json({ error: err.message }));
});

app.get('/vapid-public-key', (req, res) => {
  res.json({ key: process.env.VAPID_PUBLIC_KEY });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Сервер запущен на http://localhost:${PORT}`);
});
