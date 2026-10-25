import { db } from "../../db"; // Assuming db is exported from a central location
import { agentTasks, agentMemory } from "../../drizzle/schema";
import { eq, and } from "drizzle-orm";

/**
 * AgentController: The interface for the AI Agent to interact with
 * the local database and manage its own tasks and memory.
 */
export class AgentController {
  /**
   * Registers a new task in the agent_tasks table.
   */
  async registerTask(userId: number, taskType: string, payload: any, priority: number = 1) {
    try {
      const [newTask] = await db.insert(agentTasks).values({
        userId,
        taskType,
        payload: JSON.stringify(payload),
        priority,
        status: "pending",
      }).returning();
      return newTask;
    } catch (error) {
      console.error("Failed to register task:", error);
      throw error;
    }
  }

  /**
   * Updates the status and result of an existing task.
   */
  async updateTask(taskId: number, status: 'completed' | 'failed' | 'running', result: any = null) {
    try {
      await db.update(agentTasks)
        .set({
          status,
          result: result ? JSON.stringify(result) : null,
          updatedAt: new Date(),
        })
        .where(eq(agentTasks.id, taskId));
    } catch (error) {
      console.error("Failed to update task:", error);
      throw error;
    }
  }

  /**
   * Saves a piece of information to long-term memory.
   */
  async saveMemory(userId: number, contextKey: string, content: string, importance: number = 1) {
    try {
      await db.insert(agentMemory).values({
        userId,
        contextKey,
        content,
        importance,
      });
    } catch (error) {
      console.error("Failed to save memory:", error);
      throw error;
    }
  }

  /**
   * Retrieves memory based on a context key.
   */
  async getMemory(userId: number, contextKey: string) {
    try {
      const memories = await db.select()
        .from(agentMemory)
        .where(
          and(
            eq(agentMemory.userId, userId),
            eq(agentMemory.contextKey, contextKey)
          )
        );
      return memories;
    } catch (error) {
      console.error("Failed to retrieve memory:", error);
      throw error;
    }
  }
}
