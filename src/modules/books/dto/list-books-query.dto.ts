import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type, Transform } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
  registerDecorator,
  ValidationArguments,
  ValidationOptions,
} from 'class-validator';
import type {
  SortField,
  SortOrder,
} from '../../catalogue/domain/catalogue.types.js';

export function IsLessThanOrEqualTo(
  property: string,
  validationOptions?: ValidationOptions,
) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'isLessThanOrEqualTo',
      target: object.constructor,
      propertyName,
      constraints: [property],
      options: validationOptions,
      validator: {
        validate(value: unknown, args: ValidationArguments) {
          const [relatedPropertyName] = args.constraints;
          const relatedValue = (args.object as Record<string, unknown>)[
            relatedPropertyName
          ];
          if (value === undefined || relatedValue === undefined) {
            return true;
          }
          return (
            typeof value === 'number' &&
            typeof relatedValue === 'number' &&
            value <= relatedValue
          );
        },
        defaultMessage(args: ValidationArguments) {
          const [relatedPropertyName] = args.constraints;
          return `${args.property} must be less than or equal to ${relatedPropertyName}`;
        },
      },
    });
  };
}

export class ListBooksQueryDto {
  @ApiPropertyOptional({
    description: 'Page number (1-based)',
    default: 1,
    minimum: 1,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  @ApiPropertyOptional({
    description: 'Items per page',
    default: 20,
    minimum: 1,
    maximum: 50,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit: number = 20;

  @ApiPropertyOptional({
    description:
      'Filter by category slug or display name (e.g. "travel_2" or "Travel")',
  })
  @IsOptional()
  @IsString()
  category?: string;

  @ApiPropertyOptional({
    description: 'Minimum price filter',
    minimum: 0,
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @IsLessThanOrEqualTo('maxPrice', {
    message: 'minPrice must be less than or equal to maxPrice',
  })
  minPrice?: number;

  @ApiPropertyOptional({
    description: 'Maximum price filter',
    minimum: 0,
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  maxPrice?: number;

  @ApiPropertyOptional({
    description: 'Star rating filter (1 to 5)',
    minimum: 1,
    maximum: 5,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(5)
  rating?: 1 | 2 | 3 | 4 | 5;

  @ApiPropertyOptional({
    description:
      'Availability filter (true for in stock, false for out of stock)',
  })
  @IsOptional()
  @Transform(({ value }) => {
    if (value === 'true' || value === true) return true;
    if (value === 'false' || value === false) return false;
    return value;
  })
  @IsBoolean()
  inStock?: boolean;

  @ApiPropertyOptional({
    description: 'Sort field',
    enum: ['default', 'title', 'price', 'rating'],
    default: 'default',
  })
  @IsOptional()
  @IsIn(['default', 'title', 'price', 'rating'])
  sort: SortField = 'default';

  @ApiPropertyOptional({
    description: 'Sort direction',
    enum: ['asc', 'desc'],
    default: 'asc',
  })
  @IsOptional()
  @IsIn(['asc', 'desc'])
  order: SortOrder = 'asc';
}
