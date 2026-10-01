import { ParseError } from '../errors/app-error.js';

export const BOOK_ID_REGEX = /^[a-z0-9-]+_\d+$/;

/**
 * Resolves a relative or absolute URL against a base URL.
 */
export function resolveUrl(
  relativeOrAbsolute: string,
  baseUrl: string,
): string {
  try {
    return new URL(relativeOrAbsolute, baseUrl).href;
  } catch (err) {
    throw new ParseError(
      'url',
      `Failed to resolve URL '${relativeOrAbsolute}' against base '${baseUrl}': ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

/**
 * Extracts a book ID from a URL, href or raw slug.
 * Expected pattern: ^[a-z0-9-]+_\d+$
 */
export function extractBookId(input: string): string {
  const trimmed = input.trim();
  if (BOOK_ID_REGEX.test(trimmed)) {
    return trimmed;
  }

  // Look for segment like 'a-light-in-the-attic_1000'
  const match = trimmed.match(
    /(?:^|\/)([a-z0-9-]+_\d+)(?:\/index\.html|\/)?(?:$|[?#])/i,
  );
  if (match?.[1]) {
    return match[1].toLowerCase();
  }

  throw new ParseError('id', `Could not extract book ID from '${input}'`);
}

/**
 * Extracts a category ID from a URL, href or raw slug.
 * Expected pattern: ^[a-z0-9-]+_\d+$
 */
export function extractCategoryId(input: string): string {
  const trimmed = input.trim();
  if (BOOK_ID_REGEX.test(trimmed)) {
    return trimmed;
  }

  const match = trimmed.match(
    /(?:^|\/)([a-z0-9-]+_\d+)(?:\/index\.html|\/)?(?:$|[?#])/i,
  );
  if (match?.[1]) {
    return match[1].toLowerCase();
  }

  throw new ParseError(
    'categoryId',
    `Could not extract category ID from '${input}'`,
  );
}
