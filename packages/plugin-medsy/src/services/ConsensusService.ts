import { eq } from "drizzle-orm";
import { db } from "../database";
import { stakes } from "../database/schema";

/**
 * Consensus service for determining community verdict on health claims
 */
export class ConsensusService {
  /**
   * Get consensus verdict for a note
   */
  async getConsensusVerdict(noteId: string): Promise<{
    hasConsensus: boolean;
    finalVerdict: string;
    totalStakes: number;
  }> {
    const stakeData = await db.select().from(stakes).where(eq(stakes.noteId, noteId));

    if (stakeData.length < 3) { // Need minimum stakes for consensus
      return { hasConsensus: false, finalVerdict: "", totalStakes: stakeData.length };
    }

    // Simple majority consensus
    const supportCount = stakeData.filter(s => s.position === "support").length;
    const totalCount = stakeData.length;

    const finalVerdict = supportCount > totalCount / 2 ? "true" : "false";

    return {
      hasConsensus: true,
      finalVerdict,
      totalStakes: totalCount
    };
  }
}
