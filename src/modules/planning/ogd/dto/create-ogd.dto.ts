import {
  IsString,
  IsInt,
  IsOptional,
  IsNumber,
  IsArray,
  ValidateNested,
  MaxLength,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { MetaAnualDto } from '../../oei/dto/create-oei.dto';

export class CreateOgdDto {
  @ApiProperty({
    description: 'ID del PGD al que pertenece este OGD',
    example: 1,
  })
  @IsInt()
  pgdId: number;

  @ApiProperty({
    description: 'Codigo unico del OGD',
    example: 'OGD-001',
    maxLength: 20,
  })
  @IsString()
  @MaxLength(20)
  codigo: string;

  @ApiProperty({
    description: 'Nombre del Objetivo General Divisional',
    example: 'Optimizar la gestion de proyectos de la division',
    maxLength: 300,
  })
  @IsString()
  @MaxLength(300)
  nombre: string;

  @ApiPropertyOptional({
    description: 'Descripcion detallada del OGD',
    example: 'Mejorar los procesos de planificacion, ejecucion y seguimiento de proyectos',
  })
  @IsOptional()
  @IsString()
  descripcion?: string;

  @ApiPropertyOptional({
    description: 'Indicador de medicion del OGD',
    example: 'Porcentaje de proyectos ejecutados exitosamente',
    maxLength: 500,
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  indicador?: string;

  @ApiPropertyOptional({
    description: 'Valor de linea base para el indicador',
    example: 60,
  })
  @IsOptional()
  @IsNumber()
  lineaBase?: number;

  @ApiPropertyOptional({
    description: 'Unidad de medida del indicador',
    example: 'Porcentaje',
    maxLength: 50,
  })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  unidadMedida?: string;

  @ApiPropertyOptional({
    description: 'Metas anuales del OGD',
    type: [MetaAnualDto],
    example: [
      { anio: 2025, meta: 70 },
      { anio: 2026, meta: 80 },
      { anio: 2027, meta: 90 },
    ],
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => MetaAnualDto)
  metasAnuales?: MetaAnualDto[];
}
