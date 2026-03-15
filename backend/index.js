const express = require('express');
const { createClient } = require('redis');
const cors = require('cors');

const app = express();
app.use(express.json());
app.use(cors());

const redisClient = createClient({
  url: process.env.REDIS_URL || 'redis://localhost:6379'
});

redisClient.on('error', err => console.log('Redis Client Error', err));

app.post('/like', async (req, res) => {
  const { user_id, post_id } = req.body;
  if (!user_id || !post_id) {
    return res.status(400).json({ error: 'Missing user_id or post_id' });
  }

  try {
    const likeEvent = JSON.stringify({ user_id, post_id, timestamp: Date.now() });
    
    // Push to a separate Redis list for EACH post
    const queueKey = `like_queue:${post_id}`;
    await redisClient.lPush(queueKey, likeEvent);
    
    // Add this post_id to a set of active queues so the worker knows which queues to process
    await redisClient.sAdd('active_posts', post_id);
    
    res.status(200).json({ success: true, message: `Like queued in ${queueKey}` });
  } catch (error) {
    console.error('Error queuing like:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

const PORT = process.env.PORT || 3001;

async function start() {
  await redisClient.connect();
  app.listen(PORT, () => {
    console.log(`Backend API listening on port ${PORT}`);
  });
}

start();
