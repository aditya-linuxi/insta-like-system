'use client';

import { useState, useEffect, useRef } from 'react';
import { Heart, MessageCircle, Send, Bookmark, MoreHorizontal, PlusSquare, Home, Search, PlaySquare, User, Database, CheckCircle2, X } from 'lucide-react';
import Image from 'next/image';
import { motion, AnimatePresence } from 'motion/react';

const INITIAL_POSTS = [
  {
    id: 'naruto_post',
    author: 'naruto_uzumaki',
    authorImage: 'https://cdn.myanimelist.net/images/characters/9/131317.jpg',
    image: 'https://cdn.myanimelist.net/images/anime/1565/111305.jpg',
    likes: 1240,
    caption: 'Believe it! 🍜 Training never stops.',
  },
  {
    id: 'goku_post',
    author: 'goku_official',
    authorImage: 'https://cdn.myanimelist.net/images/characters/2/284124.jpg',
    image: 'https://cdn.myanimelist.net/images/anime/1141/142503.jpg',
    likes: 9001,
    caption: 'Is there anyone stronger out there? Let\'s spar! 💪',
  },
  {
    id: 'luffy_post',
    author: 'monkey_d_luffy',
    authorImage: 'https://cdn.myanimelist.net/images/characters/9/310307.jpg',
    image: 'https://cdn.myanimelist.net/images/anime/1244/138851.jpg',
    likes: 5600,
    caption: 'I\'m gonna be the King of the Pirates! 🍖',
  },
];

const STORIES = [
  { id: 1, name: 'Your Story', image: 'https://cdn.myanimelist.net/images/characters/11/286916.jpg', isUser: true },
  { id: 2, name: 'sasuke_u', image: 'https://cdn.myanimelist.net/images/characters/9/131319.jpg' },
  { id: 3, name: 'zoro.lost', image: 'https://cdn.myanimelist.net/images/characters/3/100534.jpg' },
  { id: 4, name: 'vegeta_prince', image: 'https://picsum.photos/seed/vegeta/100/100' },
  { id: 5, name: 'hinata_h', image: 'https://picsum.photos/seed/hinata/100/100' },
  { id: 6, name: 'sanji_cooks', image: 'https://cdn.myanimelist.net/images/characters/5/136769.jpg' },
];

export default function InstuGramFeed() {
  const [posts, setPosts] = useState(INITIAL_POSTS);
  const [userId] = useState(() => `user_${Math.floor(Math.random() * 10000)}`);
  
  // Redis Queue Visualization State (Per Post)
  const [redisQueues, setRedisQueues] = useState<Record<string, number>>({});
  const [flushMessages, setFlushMessages] = useState<Record<string, string>>({});
  const flushTimeouts = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  
  // Create Post Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [newCaption, setNewCaption] = useState('');
  const [newImageUrl, setNewImageUrl] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);

  // Fetch a random anime image from nekos.best API
  const generateNewAnimeImage = async () => {
    setIsGenerating(true);
    try {
      const res = await fetch('https://nekos.best/api/v2/neko');
      const data = await res.json();
      if (data.results && data.results.length > 0) {
        setNewImageUrl(data.results[0].url);
      }
    } catch (error) {
      console.error("Failed to fetch anime image", error);
    } finally {
      setIsGenerating(false);
    }
  };

  useEffect(() => {
    if (isModalOpen && !newImageUrl) {
      generateNewAnimeImage();
    }
  }, [isModalOpen, newImageUrl]);

  const handleLike = async (postId: string) => {
    // 1. Infinite likes: Increment post likes by 1 every time it's clicked
    setPosts(prev => 
      prev.map(post => {
        if (post.id === postId) {
          return { ...post, likes: post.likes + 1 };
        }
        return post;
      })
    );

    // 2. Update visual Redis Queue (Batching logic demonstration per post)
    setRedisQueues(prev => {
      const currentCount = prev[postId] || 0;
      const newCount = currentCount + 1;
      
      if (newCount >= 10) {
        if (flushTimeouts.current[postId]) {
          clearTimeout(flushTimeouts.current[postId]);
          delete flushTimeouts.current[postId];
        }
        // Simulate the worker flushing to MySQL for THIS specific post
        setFlushMessages(prevMsg => ({ ...prevMsg, [postId]: '10 Likes! Flushed to MySQL 🚀' }));
        setTimeout(() => {
          setFlushMessages(prevMsg => ({ ...prevMsg, [postId]: '' }));
        }, 4000);
        return { ...prev, [postId]: 0 }; // Reset queue for this post
      }

      if (currentCount === 0) {
        // Start the 20s timer on the first like
        flushTimeouts.current[postId] = setTimeout(() => {
          setRedisQueues(currentQueues => {
            const countAtTimeout = currentQueues[postId] || 0;
            if (countAtTimeout > 0 && countAtTimeout < 10) {
              setFlushMessages(prevMsg => ({ ...prevMsg, [postId]: 'Flushed to MySQL (20s Timeout) ⏱️' }));
              setTimeout(() => {
                setFlushMessages(prevMsg => ({ ...prevMsg, [postId]: '' }));
              }, 4000);
              return { ...currentQueues, [postId]: 0 };
            }
            return currentQueues;
          });
        }, 20000);
      }

      return { ...prev, [postId]: newCount };
    });

    // 3. Send actual request to backend
    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || '/api';
      await fetch(`${apiUrl}/like`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: userId, post_id: postId }),
      });
    } catch (error) {
      console.error('Failed to send like to backend:', error);
    }
  };

  const handleCreatePost = () => {
    if (!newCaption.trim() || !newImageUrl) return;
    
    const newPost = {
      id: `post_${Date.now()}`,
      author: 'anime_fan_99',
      authorImage: 'https://cdn.myanimelist.net/images/characters/11/286916.jpg',
      image: newImageUrl,
      likes: 0,
      caption: newCaption,
    };
    
    setPosts([newPost, ...posts]);
    setIsModalOpen(false);
    setNewCaption('');
    setNewImageUrl('');
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-pink-50 via-white to-rose-50 text-gray-900 font-sans pb-16 md:pb-0">
      
      <div className="flex justify-center md:py-8">
        {/* Main Feed Column */}
        <main className="w-full max-w-[470px] bg-white/80 backdrop-blur-xl min-h-screen md:min-h-fit md:rounded-3xl md:shadow-2xl md:shadow-rose-200/40 border-x md:border border-pink-100 overflow-hidden">
          
          {/* Header */}
          <header className="sticky top-0 z-40 bg-white/80 backdrop-blur-md border-b border-pink-100 px-4 py-3 flex justify-between items-center">
            <h1 className="text-2xl font-bold tracking-tighter bg-clip-text text-transparent bg-gradient-to-r from-rose-500 to-pink-600" style={{ fontFamily: 'cursive' }}>Instu-Gram</h1>
            <div className="flex gap-5 items-center text-gray-700">
              <button onClick={() => setIsModalOpen(true)} className="hover:scale-110 transition-transform text-rose-500 hover:text-rose-600">
                <PlusSquare className="w-6 h-6" />
              </button>
              <Heart className="w-6 h-6 hover:text-rose-500 transition-colors cursor-pointer" />
              <MessageCircle className="w-6 h-6 hover:text-rose-500 transition-colors cursor-pointer" />
            </div>
          </header>

          {/* Stories */}
          <div className="flex gap-4 overflow-x-auto px-4 py-4 border-b border-pink-100 scrollbar-hide bg-white/50">
            {STORIES.map(story => (
              <div key={story.id} className="flex flex-col items-center gap-1 flex-shrink-0 cursor-pointer group">
                <div className={`p-[3px] rounded-full transition-transform group-hover:scale-105 ${story.isUser ? 'bg-gray-200' : 'bg-gradient-to-tr from-rose-400 via-pink-500 to-fuchsia-600'}`}>
                  <div className="w-16 h-16 rounded-full border-2 border-white overflow-hidden relative">
                    <Image src={story.image} alt={story.name} fill className="object-cover" />
                  </div>
                </div>
                <span className="text-xs text-gray-600 truncate w-16 text-center font-medium">{story.name}</span>
              </div>
            ))}
          </div>

          {/* Feed Posts */}
          <div className="divide-y divide-pink-50 bg-white/50">
            {posts.map(post => (
              <article key={post.id} className="bg-white pb-4">
                {/* Post Header */}
                <div className="flex items-center justify-between p-3">
                  <div className="flex items-center gap-3 cursor-pointer group">
                    <div className="w-8 h-8 rounded-full overflow-hidden relative border border-pink-200 group-hover:border-rose-400 transition-colors">
                      <Image src={post.authorImage} alt={post.author} fill className="object-cover" />
                    </div>
                    <span className="font-semibold text-sm group-hover:text-rose-600 transition-colors">{post.author}</span>
                  </div>
                  <MoreHorizontal className="w-5 h-5 text-gray-400 hover:text-rose-500 cursor-pointer transition-colors" />
                </div>

                {/* Post Image */}
                <div className="relative w-full aspect-square bg-pink-50">
                  <Image src={post.image} alt="Post content" fill className="object-cover" />
                </div>

                {/* Post Actions */}
                <div className="p-3 pb-1">
                  <div className="flex justify-between items-center mb-2 text-gray-700">
                    <div className="flex gap-4">
                      {/* Infinite Like Button */}
                      <button 
                        onClick={() => handleLike(post.id)} 
                        className="group relative focus:outline-none"
                      >
                        <motion.div whileTap={{ scale: 0.8 }}>
                          <Heart className="w-7 h-7 text-rose-500 group-hover:text-rose-600 group-hover:fill-rose-50 transition-colors" />
                        </motion.div>
                      </button>
                      <MessageCircle className="w-7 h-7 hover:text-rose-500 cursor-pointer transition-colors" />
                      <Send className="w-7 h-7 hover:text-rose-500 cursor-pointer transition-colors" />
                    </div>
                    <Bookmark className="w-7 h-7 hover:text-rose-500 cursor-pointer transition-colors" />
                  </div>

                  {/* Likes Counter */}
                  <div className="font-semibold text-sm mb-1 text-gray-900">
                    {post.likes.toLocaleString()} likes
                  </div>

                  {/* Caption */}
                  <div className="text-sm text-gray-800">
                    <span className="font-semibold mr-2 cursor-pointer hover:text-rose-600 transition-colors">{post.author}</span>
                    {post.caption}
                  </div>
                  
                  {/* PER-POST REDIS QUEUE VISUALIZER */}
                  <div className="mt-3 bg-rose-50/50 p-3 rounded-xl border border-pink-100 shadow-inner">
                    <div className="flex justify-between items-center mb-1.5">
                      <div className="flex items-center gap-1.5">
                        <div className="w-2 h-2 rounded-full bg-rose-500 animate-pulse" />
                        <span className="text-xs font-semibold text-rose-800">Redis Queue ({post.id})</span>
                      </div>
                      <span className="text-xs font-bold text-rose-600">{redisQueues[post.id] || 0}/10</span>
                    </div>
                    <div className="flex gap-1 h-2">
                      {[...Array(10)].map((_, i) => (
                        <div key={i} className={`flex-1 rounded-full transition-colors duration-300 ${i < (redisQueues[post.id] || 0) ? 'bg-gradient-to-r from-rose-400 to-pink-500 shadow-sm shadow-rose-200' : 'bg-pink-100'}`} />
                      ))}
                    </div>
                    <AnimatePresence>
                      {flushMessages[post.id] && (
                        <motion.div 
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: 'auto' }}
                          exit={{ opacity: 0, height: 0 }}
                          className="text-xs text-emerald-600 font-semibold mt-2 flex items-center gap-1.5 bg-emerald-50 p-1.5 rounded-md border border-emerald-100"
                        >
                          <Database className="w-3.5 h-3.5" />
                          {flushMessages[post.id]}
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>

                  <div className="text-gray-400 text-[10px] mt-3 uppercase tracking-wider font-medium">
                    2 hours ago
                  </div>
                </div>
              </article>
            ))}
          </div>
        </main>
      </div>

      {/* Mobile Bottom Navigation */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-white/90 backdrop-blur-md border-t border-pink-100 flex justify-around items-center h-14 px-2 z-40 shadow-[0_-4px_20px_-10px_rgba(225,29,72,0.2)]">
        <Home className="w-6 h-6 text-rose-600" />
        <Search className="w-6 h-6 text-gray-400 hover:text-rose-500 transition-colors" />
        <PlaySquare className="w-6 h-6 text-gray-400 hover:text-rose-500 transition-colors" />
        <div className="w-7 h-7 rounded-full overflow-hidden relative border-2 border-rose-500">
          <Image src="https://cdn.myanimelist.net/images/characters/11/286916.jpg" alt="Profile" fill className="object-cover" />
        </div>
      </nav>

      {/* Create Post Modal */}
      <AnimatePresence>
        {isModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center px-4 bg-rose-900/40 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-white rounded-3xl shadow-2xl shadow-rose-900/20 w-full max-w-md overflow-hidden border border-pink-100"
            >
              <div className="flex justify-between items-center p-4 border-b border-pink-50 bg-rose-50/30">
                <h2 className="font-bold text-lg text-rose-900">Create New Anime Post</h2>
                <button onClick={() => setIsModalOpen(false)} className="p-1.5 hover:bg-rose-100 text-rose-600 rounded-full transition-colors">
                  <X className="w-5 h-5" />
                </button>
              </div>
              
              <div className="p-5 space-y-5">
                <div className="relative w-full aspect-square bg-pink-50 rounded-2xl overflow-hidden border border-pink-100 shadow-inner">
                  {newImageUrl ? (
                    <Image src={newImageUrl} alt="Preview" fill className="object-cover" />
                  ) : (
                    <div className="absolute inset-0 flex items-center justify-center text-rose-400 font-medium">Loading anime...</div>
                  )}
                  <div className="absolute inset-0 flex items-center justify-center bg-rose-900/20 opacity-0 hover:opacity-100 transition-opacity backdrop-blur-[2px]">
                    <button 
                      onClick={generateNewAnimeImage}
                      disabled={isGenerating}
                      className="bg-white text-rose-600 px-5 py-2.5 rounded-full font-bold text-sm shadow-xl disabled:opacity-50 hover:scale-105 transition-transform"
                    >
                      {isGenerating ? 'Generating...' : 'Generate New Image'}
                    </button>
                  </div>
                </div>
                
                <div>
                  <textarea
                    value={newCaption}
                    onChange={(e) => setNewCaption(e.target.value)}
                    placeholder="Write an anime caption..."
                    className="w-full border border-pink-200 bg-rose-50/30 rounded-xl p-4 focus:outline-none focus:ring-2 focus:ring-rose-400 focus:border-transparent resize-none h-24 text-gray-800 placeholder-rose-300"
                  />
                </div>
                
                <button 
                  onClick={handleCreatePost}
                  disabled={!newCaption.trim()}
                  className="w-full bg-gradient-to-r from-rose-500 to-pink-600 hover:from-rose-600 hover:to-pink-700 disabled:from-rose-200 disabled:to-pink-200 text-white font-bold py-3.5 rounded-xl transition-all shadow-lg shadow-rose-500/30 disabled:shadow-none"
                >
                  Share Post
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

    </div>
  );
}
