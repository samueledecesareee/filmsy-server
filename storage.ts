import {
  users,
  content,
  episodes,
  favorites,
  type User,
  type UpsertUser,
  type Content,
  type InsertContent,
  type Episode,
  type InsertEpisode,
  type Favorite,
  type InsertFavorite,
} from "@shared/schema";
import { db } from "./db";
import { eq, desc, ilike, and, sql } from "drizzle-orm";

export interface IStorage {
  // User operations (mandatory for Replit Auth)
  getUser(id: string): Promise<User | undefined>;
  upsertUser(user: UpsertUser): Promise<User>;
  
  // Content operations
  getAllContent(): Promise<Content[]>;
  getContentById(id: string): Promise<Content | undefined>;
  getContentByType(type: 'movie' | 'series'): Promise<Content[]>;
  getFeaturedContent(): Promise<Content | undefined>;
  getPopularContent(): Promise<Content[]>;
  getNewContent(): Promise<Content[]>;
  searchContent(query: string): Promise<Content[]>;
  createContent(data: InsertContent): Promise<Content>;
  updateContent(id: string, data: Partial<InsertContent>): Promise<Content>;
  deleteContent(id: string): Promise<void>;
  incrementViewCount(id: string): Promise<void>;
  
  // Episode operations
  getEpisodesByContentId(contentId: string): Promise<Episode[]>;
  createEpisode(data: InsertEpisode): Promise<Episode>;
  updateEpisode(id: string, data: Partial<InsertEpisode>): Promise<Episode>;
  deleteEpisode(id: string): Promise<void>;
  
  // Favorites operations
  getUserFavorites(userId: string): Promise<Content[]>;
  addToFavorites(data: InsertFavorite): Promise<Favorite>;
  removeFromFavorites(userId: string, contentId: string): Promise<void>;
  isFavorite(userId: string, contentId: string): Promise<boolean>;
}

export class DatabaseStorage implements IStorage {
  // User operations
  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async upsertUser(userData: UpsertUser): Promise<User> {
    const [user] = await db
      .insert(users)
      .values(userData)
      .onConflictDoUpdate({
        target: users.id,
        set: {
          ...userData,
          updatedAt: new Date(),
        },
      })
      .returning();
    return user;
  }

  // Content operations
  async getAllContent(): Promise<Content[]> {
    return await db.select().from(content).where(eq(content.isActive, true)).orderBy(desc(content.createdAt));
  }

  async getContentById(id: string): Promise<Content | undefined> {
    const [result] = await db.select().from(content).where(and(eq(content.id, id), eq(content.isActive, true)));
    return result;
  }

  async getContentByType(type: 'movie' | 'series'): Promise<Content[]> {
    return await db.select().from(content)
      .where(and(eq(content.type, type), eq(content.isActive, true)))
      .orderBy(desc(content.createdAt));
  }

  async getFeaturedContent(): Promise<Content | undefined> {
    const [result] = await db.select().from(content)
      .where(and(eq(content.isFeatured, true), eq(content.isActive, true)))
      .orderBy(desc(content.createdAt));
    return result;
  }

  async getPopularContent(): Promise<Content[]> {
    return await db.select().from(content)
      .where(eq(content.isActive, true))
      .orderBy(desc(content.viewCount))
      .limit(20);
  }

  async getNewContent(): Promise<Content[]> {
    return await db.select().from(content)
      .where(eq(content.isActive, true))
      .orderBy(desc(content.createdAt))
      .limit(20);
  }

  async searchContent(query: string): Promise<Content[]> {
    return await db.select().from(content)
      .where(and(
        eq(content.isActive, true),
        ilike(content.title, `%${query}%`)
      ))
      .orderBy(desc(content.createdAt));
  }

  async createContent(data: InsertContent): Promise<Content> {
    const [result] = await db.insert(content).values(data).returning();
    return result;
  }

  async updateContent(id: string, data: Partial<InsertContent>): Promise<Content> {
    const [result] = await db
      .update(content)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(content.id, id))
      .returning();
    return result;
  }

  async deleteContent(id: string): Promise<void> {
    await db.delete(content).where(eq(content.id, id));
  }

  async incrementViewCount(id: string): Promise<void> {
    await db
      .update(content)
      .set({ viewCount: sql`${content.viewCount} + 1` })
      .where(eq(content.id, id));
  }

  // Episode operations
  async getEpisodesByContentId(contentId: string): Promise<Episode[]> {
    return await db.select().from(episodes)
      .where(eq(episodes.contentId, contentId))
      .orderBy(episodes.seasonNumber, episodes.episodeNumber);
  }

  async createEpisode(data: InsertEpisode): Promise<Episode> {
    const [result] = await db.insert(episodes).values(data).returning();
    return result;
  }

  async updateEpisode(id: string, data: Partial<InsertEpisode>): Promise<Episode> {
    const [result] = await db
      .update(episodes)
      .set(data)
      .where(eq(episodes.id, id))
      .returning();
    return result;
  }

  async deleteEpisode(id: string): Promise<void> {
    await db.delete(episodes).where(eq(episodes.id, id));
  }

  // Favorites operations
  async getUserFavorites(userId: string): Promise<Content[]> {
    const results = await db
      .select({ content })
      .from(favorites)
      .innerJoin(content, eq(favorites.contentId, content.id))
      .where(and(eq(favorites.userId, userId), eq(content.isActive, true)));
    
    return results.map(r => r.content);
  }

  async addToFavorites(data: InsertFavorite): Promise<Favorite> {
    const [result] = await db.insert(favorites).values(data).returning();
    return result;
  }

  async removeFromFavorites(userId: string, contentId: string): Promise<void> {
    await db.delete(favorites)
      .where(and(eq(favorites.userId, userId), eq(favorites.contentId, contentId)));
  }

  async isFavorite(userId: string, contentId: string): Promise<boolean> {
    const [result] = await db.select().from(favorites)
      .where(and(eq(favorites.userId, userId), eq(favorites.contentId, contentId)));
    return !!result;
  }
}

export const storage = new DatabaseStorage();
