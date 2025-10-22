import { db } from '../db';
import { taxonomies, taxonomyMappings } from '../db/schema/xbrl-conversion';
import { FinancialItem, TaxonomyMatch, TaxonomyFramework } from '../parsers/types';
import { eq, ilike, or, desc } from 'drizzle-orm';
import fuzzymatch from 'fuzzy-matching';

export interface MappingResult {
  xbrlTag: string;
  taxonomyFramework: TaxonomyFramework;
  confidence: number;
  mappingMethod: 'exact_match' | 'fuzzy_match' | 'ai_assisted' | 'manual';
  taxonomyConcept: string;
  description?: string;
}

export interface AIMappingRequest {
  sourceField: string;
  sourceValue: any;
  sectorContext?: string;
  reportTypeContext?: string;
  existingMappings?: MappingResult[];
}

export class TaxonomyMappingService {
  private fuzzyMatcher: any;

  constructor() {
    this.fuzzyMatcher = new fuzzymatch([]);
  }

  async mapFinancialItem(
    item: FinancialItem,
    sectorContext?: string,
    reportTypeContext?: string
  ): Promise<TaxonomyMatch | null> {

    try {
      // Step 1: Try exact match in existing mappings
      const exactMatch = await this.findExactMapping(item.concept, sectorContext, reportTypeContext);
      if (exactMatch && exactMatch.confidence >= 95) {
        return {
          xbrlTag: exactMatch.xbrlTag,
          taxonomyFramework: exactMatch.taxonomyFramework as TaxonomyFramework,
          confidence: exactMatch.confidence,
          mappingMethod: 'exact_match',
          synonyms: []
        };
      }

      // Step 2: Try fuzzy matching in taxonomy database
      const fuzzyMatch = await this.findFuzzyMatch(item.concept, sectorContext, reportTypeContext);
      if (fuzzyMatch && fuzzyMatch.confidence >= 80) {
        return {
          xbrlTag: fuzzyMatch.xbrlTag,
          taxonomyFramework: fuzzyMatch.taxonomyFramework as TaxonomyFramework,
          confidence: fuzzyMatch.confidence,
          mappingMethod: 'fuzzy_match',
          synonyms: fuzzyMatch.synonyms as string[]
        };
      }

      // Step 3: Try AI-assisted mapping for complex cases
      const aiMatch = await this.getAIMapping({
        sourceField: item.concept,
        sourceValue: item.value,
        sectorContext,
        reportTypeContext,
        existingMappings: [exactMatch, fuzzyMatch].filter(Boolean)
      });

      if (aiMatch && aiMatch.confidence >= 70) {
        return {
          xbrlTag: aiMatch.xbrlTag,
          taxonomyFramework: aiMatch.taxonomyFramework,
          confidence: aiMatch.confidence,
          mappingMethod: 'ai_assisted',
          synonyms: []
        };
      }

      // Step 4: Return best match if any, or null for manual review
      const bestMatch = this.selectBestMatch([exactMatch, fuzzyMatch, aiMatch].filter(Boolean));
      if (bestMatch && bestMatch.confidence >= 60) {
        return {
          xbrlTag: bestMatch.xbrlTag,
          taxonomyFramework: bestMatch.taxonomyFramework as TaxonomyFramework,
          confidence: bestMatch.confidence,
          mappingMethod: bestMatch.mappingMethod,
          synonyms: []
        };
      }

      return null; // Requires manual mapping

    } catch (error) {
      console.error('Error mapping financial item:', error);
      return null;
    }
  }

  async mapFinancialItems(
    items: FinancialItem[],
    sectorContext?: string,
    reportTypeContext?: string
  ): Promise<Array<{ item: FinancialItem; match: TaxonomyMatch | null }>> {

    const results: Array<{ item: FinancialItem; match: TaxonomyMatch | null }> = [];

    // Process items in batches to avoid overwhelming the database
    const batchSize = 50;
    for (let i = 0; i < items.length; i += batchSize) {
      const batch = items.slice(i, i + batchSize);

      const batchPromises = batch.map(async (item) => {
        const match = await this.mapFinancialItem(item, sectorContext, reportTypeContext);
        return { item, match };
      });

      const batchResults = await Promise.all(batchPromises);
      results.push(...batchResults);
    }

    return results;
  }

  async createMapping(
    sourceField: string,
    xbrlTag: string,
    taxonomyFramework: TaxonomyFramework,
    confidence: number,
    mappingMethod: 'exact_match' | 'fuzzy_match' | 'ai_assisted' | 'manual',
    sectorContext?: string,
    reportTypeContext?: string
  ): Promise<void> {

    try {
      // Find the taxonomy entry
      const taxonomyEntry = await db.select({
        id: taxonomies.id,
        concept: taxonomies.concept,
        xbrlTag: taxonomies.xbrlTag,
        taxonomyFramework: taxonomies.taxonomyFramework
      })
        .from(taxonomies)
        .where(eq(taxonomies.xbrlTag, xbrlTag))
        .limit(1);

      if (taxonomyEntry.length === 0) {
        throw new Error(`Taxonomy entry not found for XBRL tag: ${xbrlTag}`);
      }

      // Check if mapping already exists
      const existingMapping = await db.select()
        .from(taxonomyMappings)
        .where(eq(taxonomyMappings.sourceField, sourceField))
        .limit(1);

      if (existingMapping.length > 0) {
        // Update existing mapping if new confidence is higher
        if (existingMapping[0].confidence < confidence) {
          await db.update(taxonomyMappings)
            .set({
              taxonomyId: taxonomyEntry[0].id,
              confidence,
              mappingMethod,
              sectorContext,
              reportTypeContext,
              isActive: true,
              updatedAt: new Date()
            })
            .where(eq(taxonomyMappings.id, existingMapping[0].id));
        }
      } else {
        // Create new mapping
        await db.insert(taxonomyMappings).values({
          sourceField,
          sourceFieldType: 'column_header',
          taxonomyId: taxonomyEntry[0].id,
          confidence,
          mappingMethod,
          sectorContext,
          reportTypeContext,
          isActive: true,
          mappingMetadata: {
            createdAt: new Date(),
            createdBy: 'system'
          }
        });
      }
    } catch (error) {
      console.error('Error creating taxonomy mapping:', error);
      throw error;
    }
  }

  async getMappingsForSector(sector: string, reportType?: string): Promise<any[]> {
    try {
      let query = db.select({
        sourceField: taxonomyMappings.sourceField,
        xbrlTag: taxonomies.xbrlTag,
        concept: taxonomies.concept,
        description: taxonomies.description,
        confidence: taxonomyMappings.confidence,
        mappingMethod: taxonomyMappings.mappingMethod,
        taxonomyFramework: taxonomies.taxonomyFramework
      })
        .from(taxonomyMappings)
        .innerJoin(taxonomies, eq(taxonomyMappings.taxonomyId, taxonomies.id))
        .where(
          and(
            eq(taxonomyMappings.isActive, true),
            eq(taxonomies.sector, sector)
          )
        );

      if (reportType) {
        query = query.where(and(
          eq(taxonomyMappings.isActive, true),
          eq(taxonomies.sector, sector),
          eq(taxonomies.reportType, reportType)
        ));
      }

      return await query.orderBy(desc(taxonomyMappings.confidence));
    } catch (error) {
      console.error('Error getting sector mappings:', error);
      return [];
    }
  }

  private async findExactMapping(
    concept: string,
    sectorContext?: string,
    reportTypeContext?: string
  ): Promise<MappingResult | null> {

    try {
      // Look for exact matches in taxonomy mappings
      const mappings = await db.select({
        xbrlTag: taxonomies.xbrlTag,
        concept: taxonomies.concept,
        description: taxonomies.description,
        confidence: taxonomyMappings.confidence,
        mappingMethod: taxonomyMappings.mappingMethod,
        taxonomyFramework: taxonomies.taxonomyFramework
      })
        .from(taxonomyMappings)
        .innerJoin(taxonomies, eq(taxonomyMappings.taxonomyId, taxonomies.id))
        .where(
          and(
            eq(taxonomyMappings.sourceField, concept),
            eq(taxonomyMappings.isActive, true)
          )
        )
        .limit(1);

      if (mappings.length > 0) {
        const mapping = mappings[0];
        return {
          xbrlTag: mapping.xbrlTag,
          taxonomyConcept: mapping.concept,
          description: mapping.description,
          confidence: mapping.confidence,
          mappingMethod: mapping.mappingMethod as any,
          taxonomyFramework: mapping.taxonomyFramework as TaxonomyFramework
        };
      }

      // Try to find exact match in taxonomy concepts
      const taxonomyConcepts = await db.select({
        xbrlTag: taxonomies.xbrlTag,
        concept: taxonomies.concept,
        description: taxonomies.description,
        taxonomyFramework: taxonomies.taxonomyFramework
      })
        .from(taxonomies)
        .where(
          or(
            eq(taxonomies.concept, concept),
            eq(taxonomies.xbrlTag, concept)
          )
        )
        .limit(1);

      if (taxonomyConcepts.length > 0) {
        const concept = taxonomyConcepts[0];
        return {
          xbrlTag: concept.xbrlTag,
          taxonomyConcept: concept.concept,
          description: concept.description,
          confidence: 100,
          mappingMethod: 'exact_match',
          taxonomyFramework: concept.taxonomyFramework as TaxonomyFramework
        };
      }

      return null;
    } catch (error) {
      console.error('Error finding exact mapping:', error);
      return null;
    }
  }

  private async findFuzzyMatch(
    concept: string,
    sectorContext?: string,
    reportTypeContext?: string
  ): Promise<MappingResult | null> {

    try {
      // Get all relevant taxonomy concepts for fuzzy matching
      let whereConditions = [ilike(taxonomies.concept, `%${concept}%`)];
      if (sectorContext && sectorContext !== 'all') {
        whereConditions.push(eq(taxonomies.sector, sectorContext));
      }
      if (reportTypeContext) {
        whereConditions.push(eq(taxonomies.reportType, reportTypeContext));
      }

      const candidates = await db.select({
        xbrlTag: taxonomies.xbrlTag,
        concept: taxonomies.concept,
        description: taxonomies.description,
        synonyms: taxonomies.synonyms,
        taxonomyFramework: taxonomies.taxonomyFramework
      })
        .from(taxonomies)
        .where(or(...whereConditions))
        .limit(20);

      // Perform fuzzy matching
      const fuzzyMatches = candidates.map(candidate => {
        const score = this.calculateFuzzyScore(concept, candidate.concept, candidate.synonyms as string[] || []);
        return {
          ...candidate,
          confidence: score
        };
      })
        .filter(match => match.confidence >= 80)
        .sort((a, b) => b.confidence - a.confidence);

      if (fuzzyMatches.length > 0) {
        const bestMatch = fuzzyMatches[0];
        return {
          xbrlTag: bestMatch.xbrlTag,
          taxonomyConcept: bestMatch.concept,
          description: bestMatch.description,
          confidence: bestMatch.confidence,
          mappingMethod: 'fuzzy_match',
          taxonomyFramework: bestMatch.taxonomyFramework as TaxonomyFramework
        };
      }

      return null;
    } catch (error) {
      console.error('Error finding fuzzy match:', error);
      return null;
    }
  }

  private async getAIMapping(request: AIMappingRequest): Promise<MappingResult | null> {
    try {
      // For now, implement a simplified AI mapping
      // In production, this would call an AI service like OpenAI, Claude, etc.
      const aiResponse = await this.simulateAIMapping(request);

      return aiResponse;
    } catch (error) {
      console.error('Error getting AI mapping:', error);
      return null;
    }
  }

  private async simulateAIMapping(request: AIMappingRequest): Promise<MappingResult | null> {
    // Simulate AI-based mapping with enhanced logic
    const sourceField = request.sourceField.toLowerCase();
    const value = request.sourceValue;

    // Common financial mapping patterns
    const mappingPatterns: Record<string, { tag: string; framework: TaxonomyFramework; confidence: number }> = {
      'cash': { tag: 'us-gaap:CashAndCashEquivalentsCarryingAmount', framework: 'US-GAAP', confidence: 95 },
      'accounts receivable': { tag: 'us-gaap:AccountsReceivableNetCurrent', framework: 'US-GAAP', confidence: 95 },
      'inventory': { tag: 'us-gaap:InventoryNet', framework: 'US-GAAP', confidence: 90 },
      'property': { tag: 'us-gaap:PropertyPlantAndEquipmentNet', framework: 'US-GAAP', confidence: 85 },
      'revenue': { tag: 'us-gaap:Revenues', framework: 'US-GAAP', confidence: 95 },
      'sales': { tag: 'us-gaap:Revenues', framework: 'US-GAAP', confidence: 90 },
      'net income': { tag: 'us-gaap:NetIncomeLoss', framework: 'US-GAAP', confidence: 95 },
      'total assets': { tag: 'us-gaap:Assets', framework: 'US-GAAP', confidence: 98 },
      'total liabilities': { tag: 'us-gaap:Liabilities', framework: 'US-GAAP', confidence: 98 },
      'shareholders equity': { tag: 'us-gaap:StockholdersEquity', framework: 'US-GAAP', confidence: 95 }
    };

    // Check for pattern matches
    for (const [pattern, mapping] of Object.entries(mappingPatterns)) {
      if (sourceField.includes(pattern) || pattern.includes(sourceField)) {
        // Apply contextual adjustments
        let adjustedConfidence = mapping.confidence;

        if (request.sectorContext && request.sectorContext === 'banking') {
          // Banking industry might have specific variations
          adjustedConfidence -= 5;
        }

        if (typeof value === 'number' && Math.abs(value) > 1000000) {
          // Large values suggest financial totals, increase confidence
          adjustedConfidence = Math.min(100, adjustedConfidence + 5);
        }

        return {
          xbrlTag: mapping.tag,
          taxonomyConcept: pattern,
          taxonomyFramework: mapping.framework,
          confidence: adjustedConfidence,
          mappingMethod: 'ai_assisted'
        };
      }
    }

    return null;
  }

  private calculateFuzzyScore(
    searchTerm: string,
    candidateTerm: string,
    synonyms: string[] = []
  ): number {

    // Convert to lowercase for comparison
    const search = searchTerm.toLowerCase();
    const candidate = candidateTerm.toLowerCase();

    // Exact match
    if (search === candidate) {
      return 100;
    }

    // Check synonyms
    for (const synonym of synonyms) {
      if (search === synonym.toLowerCase()) {
        return 95;
      }
    }

    // Simple fuzzy matching logic
    const searchWords = search.split(/\s+/);
    const candidateWords = candidate.split(/\s+/);

    // Word overlap score
    let overlapScore = 0;
    for (const searchWord of searchWords) {
      for (const candidateWord of candidateWords) {
        if (searchWord === candidateWord) {
          overlapScore += 20;
        } else if (candidateWord.includes(searchWord) || searchWord.includes(candidateWord)) {
          overlapScore += 10;
        }
      }
    }

    // Length difference penalty
    const lengthDiff = Math.abs(search.length - candidate.length);
    const lengthPenalty = Math.max(0, (lengthDiff / Math.max(search.length, candidate.length)) * 20);

    const finalScore = Math.max(0, overlapScore - lengthPenalty);
    return Math.min(100, Math.round(finalScore));
  }

  private selectBestMatch(matches: Array<MappingResult | null>): MappingResult | null {
    if (matches.length === 0) return null;

    // Filter out nulls
    const validMatches = matches.filter((match): match is MappingResult => match !== null);

    if (validMatches.length === 0) return null;

    // Sort by confidence and return the best match
    return validMatches.sort((a, b) => b.confidence - a.confidence)[0];
  }
}

// Create singleton instance
export const taxonomyMappingService = new TaxonomyMappingService();

import { and } from 'drizzle-orm';