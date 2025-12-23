import {
  IsString,
  IsOptional,
  IsInt,
  IsDateString,
  IsArray,
  IsEnum,
  IsBoolean,
  MaxLength,
} from 'class-validator';
import { TareaPrioridad } from '../enums/cronograma.enum';

export class CreateTareaCronogramaDto {
  @IsInt()
  cronogramaId: number;

  @IsString()
  @MaxLength(20)
  codigo: string;

  @IsString()
  @MaxLength(200)
  nombre: string;

  @IsOptional()
  @IsString()
  descripcion?: string;

  @IsDateString()
  fechaInicio: string;

  @IsDateString()
  fechaFin: string;

  @IsOptional()
  @IsEnum(TareaPrioridad)
  prioridad?: TareaPrioridad;

  @IsOptional()
  @IsInt()
  responsableId?: number;

  @IsOptional()
  @IsInt()
  tareaPadreId?: number;

  @IsOptional()
  @IsInt()
  orden?: number;

  @IsOptional()
  @IsArray()
  @IsInt({ each: true })
  dependencias?: number[];

  @IsOptional()
  @IsString()
  notas?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  fase?: string;

  @IsOptional()
  @IsBoolean()
  esHito?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  color?: string;
}
