import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { setupAuth, isAuthenticated } from "./replitAuth";
import { insertContentSchema, insertEpisodeSchema, insertFavoriteSchema } from "@shared/schema";
import { z } from "zod";

const ADMIN_PASSWORD = "cla-SAMU20";

export async function registerRoutes(app: Express): Promise<Server> {
  // Auth middleware
  await setupAuth(app);

  // Auth routes
  app.get('/api/auth/user', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      res.json(user);
    } catch (error) {
      console.error("Error fetching user:", error);
      res.status(500).json({ message: "Failed to fetch user" });
    }
  });

  // Content routes
  app.get('/api/content', async (req, res) => {
    try {
      const { type, featured, popular, new: isNew, search } = req.query;
      
      if (featured) {
        const content = await storage.getFeaturedContent();
        res.json(content || null);
      } else if (popular) {
        const content = await storage.getPopularContent();
        res.json(content);
      } else if (isNew) {
        const content = await storage.getNewContent();
        res.json(content);
      } else if (search && typeof search === 'string') {
        const content = await storage.searchContent(search);
        res.json(content);
      } else if (type && (type === 'movie' || type === 'series')) {
        const content = await storage.getContentByType(type);
        res.json(content);
      } else {
        const content = await storage.getAllContent();
        res.json(content);
      }
    } catch (error) {
      console.error("Error fetching content:", error);
      res.status(500).json({ message: "Failed to fetch content" });
    }
  });

  app.get('/api/content/:id', async (req, res) => {
    try {
      const content = await storage.getContentById(req.params.id);
      if (!content) {
        return res.status(404).json({ message: "Content not found" });
      }
      
      // Increment view count
      await storage.incrementViewCount(req.params.id);
      
      res.json(content);
    } catch (error) {
      console.error("Error fetching content:", error);
      res.status(500).json({ message: "Failed to fetch content" });
    }
  });

  // Episodes routes
  app.get('/api/content/:id/episodes', async (req, res) => {
    try {
      const episodes = await storage.getEpisodesByContentId(req.params.id);
      res.json(episodes);
    } catch (error) {
      console.error("Error fetching episodes:", error);
      res.status(500).json({ message: "Failed to fetch episodes" });
    }
  });

  // Favorites routes (protected)
  app.get('/api/favorites', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const favorites = await storage.getUserFavorites(userId);
      res.json(favorites);
    } catch (error) {
      console.error("Error fetching favorites:", error);
      res.status(500).json({ message: "Failed to fetch favorites" });
    }
  });

  app.post('/api/favorites', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { contentId } = insertFavoriteSchema.parse({ ...req.body, userId });
      
      const favorite = await storage.addToFavorites({ userId, contentId });
      res.status(201).json(favorite);
    } catch (error) {
      console.error("Error adding to favorites:", error);
      res.status(500).json({ message: "Failed to add to favorites" });
    }
  });

  app.delete('/api/favorites/:contentId', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const contentId = req.params.contentId;
      
      await storage.removeFromFavorites(userId, contentId);
      res.status(204).send();
    } catch (error) {
      console.error("Error removing from favorites:", error);
      res.status(500).json({ message: "Failed to remove from favorites" });
    }
  });

  app.get('/api/favorites/:contentId/check', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const contentId = req.params.contentId;
      
      const isFavorite = await storage.isFavorite(userId, contentId);
      res.json({ isFavorite });
    } catch (error) {
      console.error("Error checking favorite status:", error);
      res.status(500).json({ message: "Failed to check favorite status" });
    }
  });

  // Admin routes (protected by password)
  const checkAdminPassword = (req: any, res: any, next: any) => {
    const { password } = req.body;
    if (password !== ADMIN_PASSWORD) {
      return res.status(401).json({ message: "Invalid admin password" });
    }
    next();
  };

  app.post('/api/admin/verify', (req, res) => {
    const { password } = req.body;
    if (password === ADMIN_PASSWORD) {
      res.json({ success: true });
    } else {
      res.status(401).json({ message: "Invalid admin password" });
    }
  });

  app.post('/api/admin/content', checkAdminPassword, async (req, res) => {
    try {
      const contentData = insertContentSchema.parse(req.body.content || req.body);
      const content = await storage.createContent(contentData);
      res.status(201).json(content);
    } catch (error) {
      console.error("Error creating content:", error);
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid content data", errors: error.errors });
      }
      res.status(500).json({ message: "Failed to create content" });
    }
  });

  app.put('/api/admin/content/:id', checkAdminPassword, async (req, res) => {
    try {
      const contentData = insertContentSchema.partial().parse(req.body.content || req.body);
      const content = await storage.updateContent(req.params.id, contentData);
      res.json(content);
    } catch (error) {
      console.error("Error updating content:", error);
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid content data", errors: error.errors });
      }
      res.status(500).json({ message: "Failed to update content" });
    }
  });

  app.delete('/api/admin/content/:id', checkAdminPassword, async (req, res) => {
    try {
      await storage.deleteContent(req.params.id);
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting content:", error);
      res.status(500).json({ message: "Failed to delete content" });
    }
  });

  app.post('/api/admin/episodes', checkAdminPassword, async (req, res) => {
    try {
      const episodeData = insertEpisodeSchema.parse(req.body.episode || req.body);
      const episode = await storage.createEpisode(episodeData);
      res.status(201).json(episode);
    } catch (error) {
      console.error("Error creating episode:", error);
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid episode data", errors: error.errors });
      }
      res.status(500).json({ message: "Failed to create episode" });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
