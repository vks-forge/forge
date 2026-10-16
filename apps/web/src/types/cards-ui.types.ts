/**
 * Shapes of the Cards view and the Card page.
 *
 * Why: the Board's card columns and the chat transcript are derived from server rows. Naming
 *   those derived shapes keeps the pure functions that build them (domain/card-columns,
 *   domain/card-chat) and the components that draw them apart, so each is testable alone.
 *
 * Exports: CardColumnDef, CardFilter, ChatAction, ChatBlock, ChatLine, CardTab, DependencyChip,
 *   GrillView, FlowHandlers, CardPriorityMark.
 * Depends on: schemas/cards (types), schemas/card-events (types), types/board.types. Types only.
 */

import type { GrillAnswer, GrillQuestion } from '#/schemas/card-events.js';
import type { CardColumn } from '#/schemas/cards.js';
import type { ColumnTone } from '#/types/board.types.js';

export interface CardColumnDef {
  readonly id: CardColumn;
  readonly title: string;
  /** Said under the title so a column's meaning needs no manual. */
  readonly hint: string;
  readonly tone: ColumnTone;
}

export interface CardFilter {
  /** A card type name, or `all`. */
  readonly type: string;
  /** Matches id or title, case-insensitive. */
  readonly query: string;
}

/** Something the Director did while answering: its summary and whether it went through. */
export interface ChatAction {
  readonly text: string;
  /** Absent when the server did not say. */
  readonly result?: 'done' | 'refused';
}

/** A line that is more than text: a grill question, a ready plan or a finished Director step. */
export type ChatBlock =
  | {
      readonly kind: 'question';
      readonly question: GrillQuestion;
      /** The owner's answer in words once given; the question then collapses to it. */
      readonly answered: string | null;
      /** True only for the newest open question on a card that can still be answered. */
      readonly actionable: boolean;
    }
  | {
      readonly kind: 'plan_ready';
      readonly version: number;
      readonly ticketCount: number;
      readonly autoApprove: boolean;
    }
  | {
      readonly kind: 'step';
      readonly label: string;
      readonly summary: string;
      readonly files: readonly { readonly path: string; readonly bytes: number }[];
    };

/** One line of the chat transcript, derived from a history event or an unsent message. */
export interface ChatLine {
  readonly key: string;
  readonly at: string;
  /** `you` and `director` are speech; `note` is a compact system or action line. */
  readonly tone: 'you' | 'director' | 'note';
  readonly text: string;
  /** Compact lines under a Director message: what it did. */
  readonly actions: readonly ChatAction[];
  /** Set on a close suggestion: the reason the Director gave. */
  readonly closeReason?: string;
  /** Set on an action line (a `director_action` event). */
  readonly action?: ChatAction;
  /** The ticket a note is about, so the line can link to it. */
  readonly ticketId?: string;
  /** True for a line the server has not confirmed yet. */
  readonly pending?: boolean;
  /** Set on lines that render as a structured block instead of plain text. */
  readonly block?: ChatBlock;
  /** Names the owner's answer when the Director used its own recommendation. */
  readonly byRecommendation?: boolean;
}

export type CardTab = 'chat' | 'plan' | 'tickets' | 'details';

/** The grill as the history tells it (domain/director-flow). */
export interface GrillView {
  /** The newest question with no answer after it, or null. */
  readonly question: GrillQuestion | null;
  /** Every question asked, by id, so an answer can be shown as its option's words. */
  readonly questions: ReadonlyMap<string, GrillQuestion>;
  readonly answers: ReadonlyMap<string, GrillAnswer>;
  /** Open points the Director reported with that question; null when none is open. */
  readonly openPoints: number | null;
}

/** What `lineOf` needs beyond one event to draw a question or an answer. */
export interface FlowLineContext {
  readonly grill: GrillView;
  /** False on a closed card or outside the grilling phase: no question is actionable. */
  readonly canAnswer: boolean;
}

/** What the chat's structured lines can do; every button on them calls one of these. */
export interface FlowHandlers {
  readonly onAnswer: (
    questionId: string,
    answer: { optionId: string } | { text: string },
  ) => void;
  readonly onShortcut: (kind: 'use_recommendations' | 'write_plan_now') => void;
  readonly onReviewPlan: () => void;
  /** True while an answer or shortcut is in flight, so a second click does nothing. */
  readonly busy: boolean;
  /** Why the last answer or shortcut failed, in words; null when it did not. */
  readonly error: string | null;
}

/** One dependency on a card face: a card it waits for, one waiting for it, or the overflow. */
export interface DependencyChip {
  readonly key: string;
  readonly direction: 'blocked_by' | 'blocks';
  /** The other card's id; null on the "+n more" chip. */
  readonly id: string | null;
  readonly more?: number;
}

/** The part of a card the dependency chain reads. */
export interface CardLinks {
  readonly id: string;
  readonly depends_on: readonly string[];
  readonly blocks: readonly string[];
}
