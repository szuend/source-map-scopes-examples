import type {
  OriginalPosition,
  Position,
} from "@chrome-devtools/source-map-scopes-codec";

/**
 * Resolves exact 0-based { line, column } coordinates from substrings inside
 * authored TypeScript or minified JavaScript source strings.
 *
 * This avoids brittle hand-counted column numbers when calling SafeScopeInfoBuilder
 * and building source map mappings.
 */
export class TextLocator {
  readonly #text: string;
  readonly #lineStarts: number[];

  constructor(text: string) {
    this.#text = text;
    this.#lineStarts = [0];
    for (let i = 0; i < text.length; i++) {
      if (text[i] === "\n") {
        this.#lineStarts.push(i + 1);
      }
    }
  }

  get text(): string {
    return this.#text;
  }

  /**
   * Converts a 0-based character offset in `text` to a 0-based `{ line, column }`.
   */
  offsetToPosition(offset: number): Position {
    if (offset < 0 || offset > this.#text.length) {
      throw new Error(
        `Offset ${offset} is out of bounds [0, ${this.#text.length}]`,
      );
    }
    // Binary search for the line containing `offset`
    let low = 0;
    let high = this.#lineStarts.length - 1;
    while (low <= high) {
      const mid = (low + high) >>> 1;
      if (this.#lineStarts[mid] <= offset) {
        low = mid + 1;
      } else {
        high = mid - 1;
      }
    }
    const line = high;
    const column = offset - this.#lineStarts[line];
    return { line, column };
  }

  #findOffset(needle: string, occurrence = 1): number {
    if (!needle) {
      throw new Error("Needle must be a non-empty string");
    }
    let fromIndex = 0;
    let found = -1;
    for (let i = 0; i < occurrence; i++) {
      found = this.#text.indexOf(needle, fromIndex);
      if (found === -1) {
        throw new Error(
          `Could not find occurrence #${occurrence} of ${JSON.stringify(needle)} in text`,
        );
      }
      fromIndex = found + 1;
    }
    return found;
  }

  /**
   * Returns the 0-based `{ line, column }` at the start of `needle`.
   */
  at(needle: string, occurrence = 1): Position {
    const offset = this.#findOffset(needle, occurrence);
    return this.offsetToPosition(offset);
  }

  /**
   * Returns the 0-based `{ line, column }` immediately after `needle`.
   */
  after(needle: string, occurrence = 1): Position {
    const offset = this.#findOffset(needle, occurrence);
    return this.offsetToPosition(offset + needle.length);
  }

  /**
   * Returns the 1-based line number (as displayed in editors / DevTools) of the
   * start of `needle`. Use this in walkthrough text instead of hard-coding
   * line numbers.
   */
  lineNumber(needle: string, occurrence = 1): number {
    return this.at(needle, occurrence).line + 1;
  }

  /**
   * Returns an `OriginalPosition` (`{ sourceIndex, line, column }`) at the start of `needle`.
   */
  origAt(needle: string, occurrence = 1, sourceIndex = 0): OriginalPosition {
    const pos = this.at(needle, occurrence);
    return { sourceIndex, ...pos };
  }

  /**
   * Returns the exclusive end `{ line, column }` of the entire text.
   */
  end(): Position {
    return this.offsetToPosition(this.#text.length);
  }
}
