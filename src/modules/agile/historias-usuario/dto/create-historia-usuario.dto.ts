import {
  IsString,
  IsOptional,
  IsInt,
  IsEnum,
  IsArray,
  MaxLength,
  ValidateNested,
  Min,
  Max,
} from 'class-validator';
import { Type } from 'class-transformer';
import { HuPrioridad, HuEstimacion } from '../enums/historia-usuario.enum';

class CriterioAceptacionDto {
  @IsString()
  given: string;

  @IsString()
  when: string;

  @IsString()
  then: string;

  @IsOptional()
  @IsInt()
  orden?: number;
}

export class CreateHistoriaUsuarioDto {
  @IsInt()
  proyectoId: number;

  @IsOptional()
  @IsInt()
  epicaId?: number;

  @IsOptional()
  @IsInt()
  sprintId?: number;

  @IsString()
  @MaxLength(20)
  codigo: string;

  @IsString()
  @MaxLength(200)
  titulo: string;

  @IsOptional()
  @IsString()
  rol?: string;

  @IsOptional()
  @IsString()
  quiero?: string;

  @IsOptional()
  @IsString()
  para?: string;

  @IsOptional()
  @IsEnum(HuPrioridad)
  prioridad?: HuPrioridad;

  @IsOptional()
  @IsEnum(HuEstimacion)
  estimacion?: HuEstimacion;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  storyPoints?: number;

  @IsOptional()
  @IsInt()
  asignadoA?: number;

  @IsOptional()
  @IsInt()
  ordenBacklog?: number;

  @IsOptional()
  @IsString()
  notas?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CriterioAceptacionDto)
  criteriosAceptacion?: CriterioAceptacionDto[];
}
