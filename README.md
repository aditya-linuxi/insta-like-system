# Instu-Gram: High-Throughput Social Media Architecture 🚀

## 📖 Purpose
Instu-Gram is a proof-of-concept social media application designed to solve a classic system design problem: **How do you handle millions of concurrent "likes" on a viral post without crashing your relational database?**

In a traditional CRUD application, every time a user clicks "Like", a direct `INSERT` or `UPDATE` query is sent to the database. If a post goes viral, this creates massive database contention, row locks, and connection pool exhaustion, ultimately bringing the system down. 

This application demonstrates the **Queue-Based Load Leveling (Write-Behind)** pattern to absorb massive traffic spikes gracefully.

## 🏗️ Why This Application Was Made
This project was built to visually demonstrate backend system design principles on the frontend. It allows developers to see exactly how data flows from the client, into an in-memory queue, and finally into persistent storage. 

It is designed as a microservices architecture, making it perfectly suited for deployment on a **Kubernetes (K8s)** cluster where each component can be scaled independently.

## ⚙️ The Workflow (How It Works)

The architecture is split into four main components: Frontend (Next.js), Backend API (Node.js), Redis (In-Memory Queue), and a Background Worker (Node.js) + MySQL (Persistent DB).

1. **User Interaction (Frontend):** 
   A user clicks the "Like" button on an anime post. The UI updates optimistically, and an API request is fired to the backend.
   
2. **Fast Ingestion (Backend API -> Redis):**
   Instead of talking to MySQL, the Backend API immediately pushes the "Like" event into a **Redis List** specific to that post (e.g., `like_queue:post_123`). It also adds the post ID to an `active_posts` Redis Set. Redis handles this in memory, allowing for tens of thousands of operations per second.

3. **Batch Processing (Worker -> MySQL):**
   A separate Background Worker service constantly monitors the `active_posts` set in Redis. It processes the likes based on two conditions:
   * **Batch Threshold:** If a post's queue reaches **10 likes**, the worker pops those 10 likes and performs a single, highly efficient Bulk Insert/Update into the MySQL database.
   * **Time Threshold (20-Second Flush):** If a post doesn't reach 10 likes quickly, we don't want those likes sitting in Redis forever. Every **20 seconds**, the worker sweeps all active queues and flushes any remaining likes directly to MySQL, resetting the queues.

4. **Visual Feedback:**
   The frontend includes a real-time "Redis Queue Visualizer" under each post so you can actually watch the queue fill up and flush based on the 10-like limit or the 20-second timeout!

## ☸️ Kubernetes Deployment Strategy
Because this application is decoupled, it is designed to be deployed on a Kubernetes cluster:
* **Frontend Pods:** Scaled based on incoming user web trafficRaspberry.
* **Backend API Pods:** Scaled based on the volume of incoming API requests.
* **Worker Pods:** Scaled based on the length of the Redis queues (if the queue grows too fast, K8s can spin up more workers to process the backlog).
* **Redis & MySQL:** Deployed as StatefulSets or managed cloud services.
