const { createClient } = require('redis');
const mysql = require('mysql2/promise');

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';
const MYSQL_HOST = process.env.MYSQL_HOST || 'localhost';
const MYSQL_USER = process.env.MYSQL_USER || 'root';
const MYSQL_PASSWORD = process.env.MYSQL_PASSWORD || 'password';
const MYSQL_DATABASE = process.env.MYSQL_DATABASE || 'instugram';

const BATCH_SIZE = 10;
const FLUSH_INTERVAL_MS = 20 * 1000; // 20 seconds

let redisClient;
let mysqlPool;

async function init() {
  redisClient = createClient({ url: REDIS_URL });
  redisClient.on('error', err => console.log('Redis Client Error', err));
  await redisClient.connect();

  mysqlPool = mysql.createPool({
    host: MYSQL_HOST,
    user: MYSQL_USER,
    password: MYSQL_PASSWORD,
    database: MYSQL_DATABASE,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
  });

  // Ensure table exists
  const createTableQuery = `
    CREATE TABLE IF NOT EXISTS likes (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id VARCHAR(255) NOT NULL,
      post_id VARCHAR(255) NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `;
  await mysqlPool.query(createTableQuery);
  console.log('Worker initialized and connected to Redis & MySQL');
}

async function processQueue() {
  try {
    // Get all post IDs that currently have active queues
    const activePosts = await redisClient.sMembers('active_posts');
    
    for (const postId of activePosts) {
      const queueKey = `like_queue:${postId}`;
      const queueLength = await redisClient.lLen(queueKey);
      
      if (queueLength >= BATCH_SIZE) {
        console.log(`Queue for ${postId} has ${queueLength} likes, processing batch of ${BATCH_SIZE}...`);
        await flushLikes(postId, BATCH_SIZE);
      }
    }
  } catch (error) {
    console.error('Error processing queue:', error);
  } finally {
    setTimeout(processQueue, 1000); // Check every second
  }
}

async function flushLikes(postId, count) {
  const queueKey = `like_queue:${postId}`;
  const likesToProcess = [];
  
  for (let i = 0; i < count; i++) {
    const item = await redisClient.rPop(queueKey);
    if (item) {
      likesToProcess.push(JSON.parse(item));
    } else {
      break;
    }
  }

  if (likesToProcess.length > 0) {
    await insertIntoMySQL(likesToProcess);
  }
  
  // Clean up the active_posts set if the queue is now empty
  const remaining = await redisClient.lLen(queueKey);
  if (remaining === 0) {
    await redisClient.sRem('active_posts', postId);
  }
}

async function insertIntoMySQL(likes) {
  if (likes.length === 0) return;
  
  const values = likes.map(like => [like.user_id, like.post_id, new Date(like.timestamp)]);
  const query = 'INSERT INTO likes (user_id, post_id, created_at) VALUES ?';
  
  try {
    await mysqlPool.query(query, [values]);
    console.log(`Successfully inserted ${likes.length} likes into MySQL.`);
  } catch (error) {
    console.error('Error inserting into MySQL:', error);
  }
}

// Set up the 20-second interval flush for ALL active queues
setInterval(async () => {
  console.log('20-second interval reached. Flushing all remaining likes...');
  try {
    const activePosts = await redisClient.sMembers('active_posts');
    for (const postId of activePosts) {
      const queueKey = `like_queue:${postId}`;
      const queueLength = await redisClient.lLen(queueKey);
      if (queueLength > 0) {
        await flushLikes(postId, queueLength);
      }
    }
  } catch (error) {
    console.error('Error during interval flush:', error);
  }
}, FLUSH_INTERVAL_MS);

init().then(() => {
  processQueue();
}).catch(console.error);
