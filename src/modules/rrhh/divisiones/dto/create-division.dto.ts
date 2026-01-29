import {
  IsNotEmpty,
  IsString,
  IsOptional,
  IsInt,
  IsArray,
  MaxLength,
} from 'class-validator';

export class CreateDivisionDto {
  // Codigo is auto-generated with format DIV-001, DIV-002, etc.
  // If provided, it will be ignored
  @IsString()
  @IsOptional()
  @MaxLength(20)
  codigo?: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  nombre: string;

  @IsString()
  @IsOptional()
  descripcion?: string;

  @IsInt()
  @IsOptional()
  divisionPadreId?: number;

  @IsInt()
  @IsOptional()
  jefeId?: number;

  @IsInt()
  @IsOptional()
  coordinadorId?: number;

  @IsArray()
  @IsInt({ each: true })
  @IsOptional()
  scrumMasterIds?: number[];
}
