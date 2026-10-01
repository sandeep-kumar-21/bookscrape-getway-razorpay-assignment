import { PipeTransform, Injectable } from '@nestjs/common';
import { BOOK_ID_REGEX } from '../../../common/utils/url.util.js';
import { ValidationError } from '../../../common/errors/app-error.js';

@Injectable()
export class BookIdPipe implements PipeTransform<string, string> {
  transform(value: string): string {
    if (
      !value ||
      typeof value !== 'string' ||
      !BOOK_ID_REGEX.test(value.trim())
    ) {
      throw new ValidationError(
        `Invalid book ID format '${value}'. Expected format: ^[a-z0-9-]+_\\d+$`,
        'INVALID_BOOK_ID',
      );
    }
    return value.trim().toLowerCase();
  }
}
